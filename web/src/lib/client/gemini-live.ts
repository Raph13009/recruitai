import { GoogleGenAI, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai";
import { MicCapture, type AudioSink, type PcmPlayer } from "@/lib/client/audio";
import type { AvatarHandle } from "@/lib/client/avatar";
import { postJson, type EngineHandlers, type InterviewEngine, type Role } from "@/lib/client/engine";
import type { InterviewProgress } from "@/lib/interview/progress";

export interface LiveTokenInfo {
  token: string;
  model: string;
  config: LiveConnectConfig;
}

/** Mic loudness (RMS, 0 to 1) above which the candidate is considered to be speaking. */
const VOICE_LEVEL = 0.035;
/** How long after the last loud chunk the candidate still counts as speaking. */
const VOICE_HANG_MS = 500;
/** Hard cap: never keep the mic muted forever if playback state sticks. */
const MAX_AGENT_HOLD_MS = 12_000;
/** If the candidate spoke/typed and Camille stays silent, nudge the model. */
const RESPONSE_NUDGE_MS = 8_000;

/**
 * The real-time interviewer: Gemini Live in the browser, with an ephemeral token.
 * It owns the mic capture, the conversation and the tool calls. Its voice goes to a sink:
 * the speakers, or the video avatar, which plays the same audio lip-synced.
 *
 * Turn-taking follows Raphaël's fix (2622617): the interviewer is never interrupted. The mic is
 * held while she speaks, so room noise or the echo of her own voice cannot cut her off, and a typed
 * answer waits for the end of her sentence.
 *
 * Create the PcmPlayer inside the click handler (the AudioContext needs a user gesture).
 */
export class GeminiEngine implements InterviewEngine {
  readonly kind = "gemini" as const;

  private mic = new MicCapture();
  private session: Session | null = null;
  private avatar: AvatarHandle | null = null;
  private sink: AudioSink;
  private closing = false;
  private muted = false;
  /** The call can start without a mic (typed answers); it opens when the candidate unmutes. */
  private micStarted = false;
  private micStarting: Promise<boolean> | null = null;
  private micDeviceId: string | undefined;
  private pendingMicStream: MediaStream | null = null;
  private buffers: Record<Role, string> = { agent: "", candidate: "" };
  private saveQueue: Promise<unknown> = Promise.resolve();
  private endRequested = false;
  private endFired = false;
  private agentSpeaking = false;
  private candidateSpeaking = false;
  /** The model is still producing the current turn. */
  private generating = false;
  /** The interviewer is producing or still playing a turn: the mic is held meanwhile. */
  private agentTalking = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Typed answers sent while the interviewer was talking, delivered once she has finished. */
  private pendingTexts: string[] = [];
  private kickoff = "";
  private started = false;
  private lastVoiceAt = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  /** When the mic was last held for Camille's turn (force-release watchdog). */
  private holdSince = 0;
  /** Waiting for Camille after a candidate turn. */
  private awaitingReplySince = 0;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private nudged = false;

  constructor(
    private readonly sessionToken: string,
    private readonly handlers: EngineHandlers,
    private readonly speaker: PcmPlayer,
  ) {
    this.sink = speaker;
  }

  get video(): boolean {
    return this.avatar !== null;
  }

  /** Route the interviewer's voice to the video avatar. */
  useAvatar(avatar: AvatarHandle) {
    this.avatar = avatar;
    this.sink = avatar;
    this.handlers.onVideo(true);
  }

  /** The avatar is gone (time limit, network): the call continues on the speakers. */
  dropAvatar(notice?: string) {
    const avatar = this.avatar;
    if (!avatar) return;
    this.avatar = null;
    this.sink = this.speaker;
    void avatar.stop();
    this.handlers.onVideo(false);
    if (notice && !this.closing) this.handlers.onNotice(notice);
  }

  /** `micEnabled: false` starts without a mic: the candidate types, the interviewer still speaks. */
  async connect(
    info: LiveTokenInfo,
    opts: {
      micDeviceId?: string;
      resumed?: boolean;
      micEnabled?: boolean;
      /** Reuse the lobby mic track when present (mobile). */
      micStream?: MediaStream | null;
    } = {},
  ): Promise<void> {
    // Ephemeral tokens work with Live API on the v1beta endpoint.
    const ai = new GoogleGenAI({ apiKey: info.token, httpOptions: { apiVersion: "v1beta" } });
    this.session = await ai.live.connect({
      model: info.model,
      config: info.config,
      callbacks: {
        onmessage: (m) => void this.onMessage(m),
        onerror: () => this.fail("Erreur de connexion à la voix de l'entretien."),
        onclose: () => this.fail("La connexion vocale s'est interrompue."),
      },
    });
    await this.speaker.unlock(); // resume speakers; checked again before speaking
    this.micDeviceId = opts.micDeviceId;
    this.pendingMicStream = opts.micStream ?? null;
    if (opts.micEnabled === false) {
      this.muted = true;
      // Lobby handed us a stream we will not use for typed mode.
      this.pendingMicStream?.getTracks().forEach((t) => t.stop());
      this.pendingMicStream = null;
    } else await this.startMic();
    this.ticker = setInterval(() => this.tick(), 100);
    const typed = opts.micEnabled === false ? " Le candidat n'a pas de micro : il répond par écrit, tu l'entends en texte." : "";
    // Sent by begin(), once the candidate can hear (Raphaël's "Faire parler Camille", 77d7318).
    this.kickoff =
      (opts.resumed
        ? "La connexion est rétablie. Reprends l'entretien maintenant sans refaire l'ouverture."
        : "Commence l'entretien maintenant. Prononce ton ouverture exacte une seule fois (identité + poste + première question), puis attends ma réponse. Ne demande pas si je suis prêt.") +
      typed;
  }

  async unlock(): Promise<boolean> {
    const speakers = await this.speaker.unlock();
    // With the avatar, the voice comes out of its video element.
    return this.avatar ? this.avatar.unlock() : speakers;
  }

  begin() {
    if (this.started || !this.session || this.closing) return;
    this.started = true;
    this.session.sendRealtimeInput({ text: this.kickoff });
  }

  async setMicMuted(muted: boolean): Promise<boolean> {
    if (this.micStarting) await this.micStarting;
    if (!muted && !this.micStarted) {
      // Started without a mic: open it now (this runs from the candidate's click).
      this.micStarting = this.startMic().then(
        () => true,
        () => false,
      );
      const opened = await this.micStarting;
      this.micStarting = null;
      if (!opened) {
        this.mic.stop();
        if (!this.closing) {
          this.handlers.onNotice("Le micro n'est pas accessible. Autorisez-le dans la barre d'adresse, ou continuez par écrit.");
        }
        return false;
      }
    }
    if (muted === this.muted) return true;
    this.muted = muted;
    this.mic.setMuted(muted);
    // Tell the model the audio stream paused, so it handles what it already heard.
    if (muted) this.session?.sendRealtimeInput({ audioStreamEnd: true });
    return true;
  }

  sendText(text: string) {
    const clean = text.trim();
    if (!clean || !this.session) return;
    this.flush("candidate");
    this.emitTurn("candidate", clean);
    // The interviewer finishes her sentence first; the answer follows right after.
    if (this.agentTalking) this.pendingTexts.push(clean);
    else this.session.sendRealtimeInput({ text: clean });
    this.armReplyWatchdog();
  }

  agentLevel(): number {
    return this.sink.level();
  }

  settle(): Promise<void> {
    return this.saveQueue.then(() => undefined);
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    if (this.ticker) clearInterval(this.ticker);
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.flush();
    this.pendingMicStream?.getTracks().forEach((t) => t.stop());
    this.pendingMicStream = null;
    this.mic.stop();
    this.speaker.close();
    void this.avatar?.stop();
    this.avatar = null;
    this.session?.close();
    this.session = null;
  }

  // ---------- internals ----------

  private async startMic() {
    const existing = this.pendingMicStream;
    this.pendingMicStream = null;
    await this.mic.start(
      (chunk) => {
        // Held while the interviewer talks: noise and echo must not reach the model.
        if (this.muted || !this.session || this.agentTalking) return;
        this.session.sendRealtimeInput({ audio: { data: chunk, mimeType: "audio/pcm;rate=16000" } });
      },
      (level) => this.onMicLevel(this.agentTalking ? 0 : level),
      this.micDeviceId,
      existing,
    );
    if (this.closing) {
      this.mic.stop(); // the call ended while the browser was opening the mic
      return;
    }
    this.micStarted = true;
    this.mic.setMuted(this.muted);
  }

  private fail(message: string) {
    if (this.closing) return;
    this.handlers.onError(message);
  }

  /** The interviewer started a turn: hold the mic until she has finished speaking. */
  private holdMic() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    if (!this.agentTalking) this.holdSince = performance.now();
    this.agentTalking = true;
    this.clearReplyWatchdog();
  }

  /** Reopens the mic once the last words have been played (the audio outlasts the generation). */
  private releaseMicWhenSilent() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    const check = () => {
      this.releaseTimer = null;
      if (this.closing || this.generating) return; // a new turn started: it will release again
      if (this.sink.isPlaying) {
        this.releaseTimer = setTimeout(check, 150);
        return;
      }
      this.forceReleaseMic();
    };
    check();
  }

  private forceReleaseMic() {
    this.agentTalking = false;
    this.holdSince = 0;
    if (this.pendingTexts.length && this.session) {
      this.session.sendRealtimeInput({ text: this.pendingTexts.join("\n") });
      this.pendingTexts = [];
      this.armReplyWatchdog();
    }
  }

  private armReplyWatchdog() {
    this.awaitingReplySince = performance.now();
    this.nudged = false;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => this.nudgeIfSilent(), RESPONSE_NUDGE_MS);
  }

  private clearReplyWatchdog() {
    this.awaitingReplySince = 0;
    this.nudged = false;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = null;
  }

  /** Unsticks a silent model after the candidate already spoke or typed. */
  private nudgeIfSilent() {
    this.nudgeTimer = null;
    if (this.closing || !this.session || this.agentTalking || this.generating || this.nudged) return;
    if (!this.awaitingReplySince) return;
    this.nudged = true;
    this.session.sendRealtimeInput({
      text: "Réponds maintenant à ce que je viens de dire, en une phrase courte, puis pose la question suivante. Ne reste pas silencieuse.",
    });
  }

  private tick() {
    const speaking = this.sink.isPlaying;
    if (speaking !== this.agentSpeaking) {
      this.agentSpeaking = speaking;
      this.handlers.onAgentSpeaking(speaking);
    }
    // Playback or generation state can stick: reopen the mic so the candidate is not locked out.
    if (this.agentTalking && this.holdSince && performance.now() - this.holdSince > MAX_AGENT_HOLD_MS) {
      this.generating = false;
      this.forceReleaseMic();
    }
  }

  private onMicLevel(level: number) {
    const now = performance.now();
    if (level > VOICE_LEVEL) this.lastVoiceAt = now;
    const speaking = this.lastVoiceAt > 0 && now - this.lastVoiceAt < VOICE_HANG_MS;
    if (speaking === this.candidateSpeaking) return;
    this.candidateSpeaking = speaking;
    this.handlers.onCandidateSpeaking(speaking);
    // The avatar takes an attentive pose while the candidate talks.
    this.avatar?.setListening(speaking);
  }

  private async onMessage(message: LiveServerMessage) {
    const content = message.serverContent;
    if (content) {
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          this.generating = true;
          this.holdMic();
          this.sink.enqueue(part.inlineData.data);
        }
      }
      const heard = content.inputTranscription?.text;
      if (heard) this.caption("candidate", heard);
      if (content.outputTranscription?.text) {
        this.holdMic();
        this.caption("agent", content.outputTranscription.text);
      }
      if (content.interrupted) {
        // Rare with interruption turned off: drop what is left and listen.
        this.generating = false;
        this.sink.interrupt();
        this.flush("agent");
        this.releaseMicWhenSilent();
      }
      if (content.turnComplete) {
        this.generating = false;
        this.sink.endTurn();
        this.flush();
        this.releaseMicWhenSilent();
        if (this.endRequested) this.fireEnd();
      }
    }
    if (message.toolCall?.functionCalls?.length) await this.onToolCall(message.toolCall.functionCalls);
  }

  private caption(role: Role, chunk: string) {
    const other: Role = role === "agent" ? "candidate" : "agent";
    // The speaker changed: the previous speaker's turn is over.
    if (this.buffers[other]) this.flush(other);
    this.buffers[role] += chunk;
    this.handlers.onCaption(role, this.buffers[role].trim());
  }

  private flush(only?: Role) {
    for (const role of ["candidate", "agent"] as Role[]) {
      if (only && only !== role) continue;
      const text = this.buffers[role].trim();
      this.buffers[role] = "";
      if (text) this.emitTurn(role, text);
    }
  }

  /** Shows a finished turn and stores it (text only), one at a time and in order. */
  private emitTurn(role: Role, text: string) {
    this.handlers.onTurn(role, text);
    this.saveQueue = this.saveQueue.then(() =>
      postJson(`/api/sessions/${this.sessionToken}/transcript`, { turns: [{ role, text: text.slice(0, 2000) }] }).catch(
        () => undefined,
      ),
    );
  }

  private async onToolCall(calls: NonNullable<LiveServerMessage["toolCall"]>["functionCalls"]) {
    const functionResponses = [];
    for (const call of calls ?? []) {
      let output = "Impossible d'enregistrer cette information pour le moment.";
      try {
        const res = await fetch(`/api/sessions/${this.sessionToken}/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: call.name, args: call.args ?? {} }),
          signal: AbortSignal.timeout(8_000),
        });
        const data = (await res.json()) as { result?: string; error?: string; progress?: InterviewProgress };
        output = data.result ?? data.error ?? output;
        if (data.progress) this.handlers.onProgress(data.progress);
      } catch {
        /* keep the default output; the conversation continues */
      }
      if (call.name === "end_interview") this.endRequested = true;
      functionResponses.push({ id: call.id, name: call.name, response: { output } });
    }
    this.session?.sendToolResponse({ functionResponses });
    // Tool round-trips must not leave Camille silent: ask her to continue if nothing follows.
    this.armReplyWatchdog();
    // If no closing turn follows, end anyway after a short wait.
    if (this.endRequested) setTimeout(() => this.fireEnd(), 6000);
  }

  /** Waits for the goodbye to finish playing, then asks the UI to end. */
  private fireEnd() {
    if (this.endFired) return;
    this.endFired = true;
    const startedAt = Date.now();
    const wait = () => {
      if (this.closing) return;
      if (this.sink.isPlaying && Date.now() - startedAt < 30_000) setTimeout(wait, 250);
      else this.handlers.onEnded();
    };
    wait();
  }
}
