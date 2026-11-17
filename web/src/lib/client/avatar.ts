import type { AudioSink } from "@/lib/client/audio";
import { base64ToBytes, bytesToBase64 } from "@/lib/client/audio";
import { PcmBatcher } from "@/lib/client/pcm-batcher";

// The interviewer's face: a LiveAvatar (HeyGen) photoreal avatar in LITE mode.
// We do not let LiveAvatar run the conversation. The voice model (Gemini Live) runs in this browser
// with our prompt and tools; its audio is streamed to the avatar over a WebSocket and the avatar
// plays it back lip-synced through WebRTC. Protocol: https://docs.liveavatar.com/docs/lite-mode/events
//   -> agent.speak { audio: base64 PCM16 24 kHz mono }   (frames of about one second)
//   -> agent.speak_end                                     (the utterance is complete)
//   -> agent.interrupt                                     (barge-in: drop what is buffered)
//   -> agent.start_listening / agent.stop_listening        (attentive pose while the candidate talks)
//   <- agent.speak_started / agent.speak_ended / agent.speak_interrupted

const STREAM_READY_TIMEOUT_MS = 20_000;
/** After the last audio chunk, how long to wait for more before sending what is buffered. */
const TAIL_FLUSH_MS = 120;
/** If the avatar never confirms the end of an utterance, assume it ended this long after its audio. */
const SPEAK_END_GRACE_MS = 4_000;

export interface AvatarHandle extends AudioSink {
  /** Attentive pose while the candidate is talking. Ignored while the avatar speaks. */
  setListening(listening: boolean): void;
  /** Ends the avatar session (stops billing). */
  stop(): Promise<void>;
}

export interface AvatarOptions {
  sessionToken: string;
  /** Receives the avatar's video and audio. */
  video: HTMLVideoElement;
  /** The avatar session ended on its own (time limit, credits, network). */
  onDisconnected: () => void;
}

/** Starts the avatar session and resolves once its video stream is playing in `video`. */
export async function connectAvatar(opts: AvatarOptions): Promise<AvatarHandle> {
  const { LiveAvatarSession, SessionEvent } = await import("@heygen/liveavatar-web-sdk");

  // The SDK keeps its event socket protected and only exposes one-shot audio commands.
  // Streaming needs the socket itself, so a subclass hands it out.
  class StreamingSession extends LiveAvatarSession {
    get socket(): WebSocket | null {
      return this._sessionEventSocket;
    }
  }

  // The mic is captured by our own pipeline for the voice model; the avatar room does not need it.
  const session = new StreamingSession(opts.sessionToken, { voiceChat: { defaultMuted: true }, autoKeepAlive: true });

  let ready = false;
  let stopped = false;
  const streamReady = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Le flux vidéo de l'avatar n'est pas arrivé à temps.")), STREAM_READY_TIMEOUT_MS);
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      clearTimeout(timer);
      resolve();
    });
    session.on(SessionEvent.SESSION_DISCONNECTED, () => {
      clearTimeout(timer);
      reject(new Error("La session de l'avatar s'est fermée."));
      // Before the stream is ready the failure is reported by the rejected promise instead.
      if (ready && !stopped) opts.onDisconnected();
    });
  });
  // Avoid an unhandled rejection if the session drops after it became ready.
  streamReady.catch(() => undefined);

  try {
    await session.start();
    await streamReady;
    ready = true;
  } catch (err) {
    stopped = true;
    await session.stop().catch(() => undefined);
    throw err;
  }

  const socket = session.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    stopped = true;
    await session.stop().catch(() => undefined);
    throw new Error("L'avatar ne propose pas de canal audio pour cette session.");
  }

  session.attach(opts.video);
  void opts.video.play().catch(() => undefined);
  try {
    session.voiceChat.stop(); // release the SDK's own (muted) mic capture
  } catch {
    /* not started */
  }

  const batcher = new PcmBatcher();
  let utteranceId: string | null = null; // utterance currently open on the avatar side
  let lastUtteranceId: string | null = null; // most recent utterance, open or already sealed
  let unfinished = 0; // utterances sent whose end the avatar has not reported yet
  let speaking = false; // audio sent and not yet confirmed finished
  let speakDeadline = 0; // fallback end of speech, from the amount of audio sent
  let listening = false;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  let level = 0;

  const send = (message: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const sendFrame = (frame: Uint8Array) => {
    if (!frame.length) return;
    const now = Date.now();
    if (!utteranceId) {
      utteranceId = lastUtteranceId = crypto.randomUUID();
      unfinished += 1;
      if (listening) {
        send({ type: "agent.stop_listening" });
        listening = false;
      }
      speakDeadline = now;
    }
    send({ type: "agent.speak", event_id: utteranceId, audio: bytesToBase64(frame) });
    speaking = true;
    // 48 bytes per millisecond (PCM16 mono 24 kHz).
    speakDeadline = Math.max(speakDeadline, now) + frame.length / 48;
    level = frameLevel(frame);
  };

  const clearTail = () => {
    if (tailTimer) clearTimeout(tailTimer);
    tailTimer = null;
  };

  socket.addEventListener("message", (event) => {
    let data: { type?: string; source_event_id?: string | null } | null = null;
    try {
      data = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!data?.type) return;
    if (data.type === "agent.speak_ended" || data.type === "agent.speak_interrupted") {
      unfinished = Math.max(0, unfinished - 1);
      // Several utterances can be queued (speech, a tool call, more speech): the avatar is done
      // talking only when the latest one, already sealed, has ended.
      const isLatest = data.source_event_id ? data.source_event_id === lastUtteranceId : unfinished === 0;
      if (isLatest && !utteranceId) {
        speaking = false;
        level = 0;
      }
    }
  });

  const stillSpeaking = () => {
    // No confirmation from the avatar: trust the amount of audio that was sent.
    if (speaking && !utteranceId && Date.now() > speakDeadline + SPEAK_END_GRACE_MS) speaking = false;
    return speaking;
  };

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTail();
    await session.stop().catch(() => undefined);
  };

  return {
    enqueue(base64Pcm) {
      for (const frame of batcher.push(base64ToBytes(base64Pcm))) sendFrame(frame);
      clearTail();
      tailTimer = setTimeout(() => {
        const rest = batcher.flush();
        if (rest) sendFrame(rest);
      }, TAIL_FLUSH_MS);
    },

    endTurn() {
      clearTail();
      const rest = batcher.flush();
      if (rest) sendFrame(rest);
      batcher.startUtterance();
      if (utteranceId) {
        send({ type: "agent.speak_end" });
        utteranceId = null;
      }
    },

    interrupt() {
      clearTail();
      batcher.reset();
      if (speaking || utteranceId) send({ type: "agent.interrupt" });
      utteranceId = null;
      unfinished = 0;
      speaking = false;
      level = 0;
    },

    get isPlaying() {
      return stillSpeaking();
    },

    async unlock() {
      // The avatar's voice comes with its video: it is audible once the element plays.
      if (!opts.video.paused) return true;
      return opts.video.play().then(
        () => true,
        () => false,
      );
    },

    level() {
      // The avatar is on screen: the video itself shows who is talking. A coarse value is enough.
      return stillSpeaking() ? Math.max(0.15, level) : 0;
    },

    setListening(next) {
      if (next === listening || speaking || utteranceId) return;
      listening = next;
      send({ type: next ? "agent.start_listening" : "agent.stop_listening" });
    },

    close() {
      void stop();
    },

    stop,
  };
}

/** Rough loudness (0 to 1) of a PCM16 frame, sampled sparsely. */
function frameLevel(frame: Uint8Array): number {
  const samples = new Int16Array(frame.buffer, frame.byteOffset, Math.floor(frame.byteLength / 2));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += 16) {
    const s = samples[i] / 0x8000;
    sum += s * s;
    count++;
  }
  return count ? Math.min(1, Math.sqrt(sum / count) * 3) : 0;
}
