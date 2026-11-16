// Browser audio helpers for Gemini Live: mic -> 16 kHz PCM16 (base64), PCM16 24 kHz (base64) -> speakers.

export const MIC_SAMPLE_RATE = 16000;
export const PLAYBACK_SAMPLE_RATE = 24000;

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

/** Asks for mic access and releases it right away. Throws if denied. */
export async function requestMicPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private muted = false;

  /** `onChunk` receives base64 PCM16 mono 16 kHz. Nothing is sent while muted. */
  async start(onChunk: (base64Pcm: string) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (!this.muted) onChunk(bytesToBase64(new Uint8Array(e.data)));
    };
    this.ctx.createMediaStreamSource(this.stream).connect(this.node);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = this.stream = this.ctx = null;
  }
}

/** Plays PCM16 24 kHz chunks back to back (one queue, so turns never overlap). */
export class PcmPlayer {
  private ctx = new AudioContext();
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  enqueue(base64Pcm: string) {
    const bytes = base64ToBytes(base64Pcm);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** True while queued audio is still audible. */
  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  /** Drops everything queued (used when the candidate interrupts). */
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

  pause() {
    return this.ctx.suspend();
  }

  resume() {
    return this.ctx.resume();
  }

  close() {
    this.interrupt();
    void this.ctx.close();
  }
}
