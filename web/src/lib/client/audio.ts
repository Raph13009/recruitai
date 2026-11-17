// Browser audio helpers for the live interview:
// mic -> 16 kHz PCM16 (base64) for the voice model, PCM16 24 kHz (base64) -> speakers.

export const MIC_SAMPLE_RATE = 16000;
export const PLAYBACK_SAMPLE_RATE = 24000;

/**
 * Where the interviewer's voice goes. Two implementations: the speakers (audio-only call) and the
 * video avatar, which plays the same audio itself, lip-synced.
 */
export interface AudioSink {
  /** Queue base64 PCM16 24 kHz mono for playback. */
  enqueue(base64Pcm: string): void;
  /** The model finished generating this turn (queued audio may still be playing). */
  endTurn(): void;
  /** Stop speaking now and drop what is queued. */
  interrupt(): void;
  /**
   * Makes sure the candidate can hear. Resolves false while the browser still blocks sound
   * (it then needs a click on the page).
   */
  unlock(): Promise<boolean>;
  /** True while speech is still being played to the candidate. */
  readonly isPlaying: boolean;
  /** Output loudness from 0 to 1, for the on-screen presence. */
  level(): number;
  close(): void;
}

// Runs in the audio thread. Downsamples the mic stream to 16 kHz and posts Int16 chunks of ~32 ms.
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${MIC_SAMPLE_RATE};
    this.pos = 0;
    this.out = new Int16Array(512);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const j = Math.min(i + 1, ch.length - 1);
      const s = ch[i] + (ch[j] - ch[i]) * (this.pos - i);
      this.out[this.n++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.slice().buffer);
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Root mean square of PCM16 samples, from 0 to 1. */
export function pcm16Level(samples: Int16Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 0x8000;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

export const micConstraints = (deviceId?: string): MediaTrackConstraints => ({
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
});

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private muted = false;

  /**
   * `onChunk` receives base64 PCM16 mono 16 kHz. Nothing is sent while muted.
   * `onLevel` receives the mic loudness (0 to 1) about 30 times a second, 0 while muted.
   */
  async start(onChunk: (base64Pcm: string) => void, onLevel?: (level: number) => void, deviceId?: string): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(deviceId) });
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.muted) {
        onLevel?.(0);
        return;
      }
      onLevel?.(pcm16Level(new Int16Array(e.data)));
      onChunk(bytesToBase64(new Uint8Array(e.data)));
    };
    this.ctx.createMediaStreamSource(this.stream).connect(this.node);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    // Also disable the track so the browser's mic indicator reflects the mute.
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = this.stream = this.ctx = null;
  }
}

/** Plays PCM16 24 kHz chunks back to back on the speakers (one queue, so turns never overlap). */
export class PcmPlayer implements AudioSink {
  private ctx = new AudioContext();
  private analyser = this.ctx.createAnalyser();
  private scope = new Uint8Array(256);
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.analyser.fftSize = 256;
    this.analyser.connect(this.ctx.destination);
  }

  enqueue(base64Pcm: string) {
    const bytes = base64ToBytes(base64Pcm);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  endTurn() {
    /* nothing to seal: queued buffers simply play out */
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  level(): number {
    if (!this.sources.size) return 0;
    this.analyser.getByteTimeDomainData(this.scope);
    let sum = 0;
    for (let i = 0; i < this.scope.length; i++) {
      const s = (this.scope[i] - 128) / 128;
      sum += s * s;
    }
    return Math.min(1, Math.sqrt(sum / this.scope.length) * 3);
  }

  interrupt() {
    this.sources.forEach((s) => {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
    this.nextTime = 0;
  }

  async unlock(): Promise<boolean> {
    // A blocked resume() can stay pending: do not wait for it forever.
    await Promise.race([this.ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 400))]);
    return this.ctx.state === "running";
  }

  close() {
    this.interrupt();
    void this.ctx.close();
  }
}
