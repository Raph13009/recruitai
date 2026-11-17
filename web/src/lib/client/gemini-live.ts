import { GoogleGenAI, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai";
import { MicCapture, PcmPlayer } from "@/lib/client/audio";

export type Role = "agent" | "candidate";

export interface GeminiLiveHandlers {
  /** Live caption, updated as transcription chunks arrive. */
  onCaption: (role: Role, text: string) => void;
  /** A finished turn (text only), ready to be stored. */
  onTurn: (role: Role, text: string) => void;
  /** The agent called end_interview and has finished speaking. */
  onEndRequested: () => void;
  onError: (message: string) => void;
  /**
   * Optional PCM16 24 kHz mono base64 chunks from the model (for LiveAvatar lip-sync).
   * When provided with playLocalAudio=false, audio is only forwarded here.
   */
  onPcm?: (base64Pcm24k: string) => void;
}

export interface GeminiLiveOptions {
  /** Capture and stream the mic (default true). Set false for text-only replies. */
  enableMic?: boolean;
  /** Play model audio in the browser (default true). Set false when an avatar plays it. */
  playLocalAudio?: boolean;
}

export interface LiveTokenInfo {
  token: string;
  model: string;
  config: LiveConnectConfig;
}

/**
 * Gemini Live in the browser using an ephemeral token. Owns mic capture and playback.
 * Create it inside the click handler (the AudioContext needs a user gesture), then call connect().
 */
export class GeminiLiveClient {
  private player = new PcmPlayer();
  private mic = new MicCapture();
  private session: Session | null = null;
  private closing = false;
  private paused = false;
  private started = false;
  /** True while Camille is producing / playing a turn — mic audio is not forwarded. */
  private agentSpeaking = false;
  private micEnabled: boolean;
  private playLocalAudio: boolean;
  private buffers: Record<Role, string> = { agent: "", candidate: "" };
  private endRequested = false;
  private endFired = false;

  constructor(
    private sessionToken: string,
    private handlers: GeminiLiveHandlers,
    options: GeminiLiveOptions = {},
  ) {
    this.micEnabled = options.enableMic !== false;
    this.playLocalAudio = options.playLocalAudio !== false;
  }

  async connect(info: LiveTokenInfo): Promise<void> {
    // Ephemeral tokens work with Live API on the v1beta endpoint.
    const ai = new GoogleGenAI({ apiKey: info.token, httpOptions: { apiVersion: "v1beta" } });
    this.session = await ai.live.connect({
      model: info.model,
      config: info.config,
      callbacks: {
        onmessage: (m) => void this.onMessage(m),
        onerror: () => this.fail("Erreur de connexion à Gemini Live."),
        onclose: () => {
          if (!this.closing) this.fail("La connexion vocale s'est interrompue.");
        },
      },
    });
    // Unlock AudioContext early (still needs a later user gesture on some browsers).
    if (this.playLocalAudio) await this.player.resume();
    if (this.micEnabled) {
      await this.mic.start((chunk) => {
        // Hold mic while Camille talks so room noise / speaker bleed cannot cut her off.
        if (this.paused || !this.started || !this.session || this.agentSpeaking) return;
        this.session.sendRealtimeInput({ audio: { data: chunk, mimeType: "audio/pcm;rate=16000" } });
      });
    }
    // Do not auto-speak: the UI shows "Faire parler Camille" so playback unlocks on click.
  }

  /**
   * Explicit kickoff from a user click. Resumes audio, then asks Camille to open the interview.
   * Not recorded as a candidate turn.
   */
  async beginInterview(): Promise<void> {
    if (!this.session || this.started || this.paused) return;
    this.started = true;
    if (this.playLocalAudio) await this.player.resume();
    this.session.sendRealtimeInput({
      text: "Commence l'entretien maintenant. Prononce ton ouverture, puis attends ma réponse.",
    });
  }

  get hasStarted(): boolean {
    return this.started;
  }

  /** Send a typed candidate reply (and stop treating mic audio as the turn). */
  sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !this.session || this.paused) return;
    if (!this.started) void this.beginInterview();
    this.flush("candidate");
    this.handlers.onTurn("candidate", trimmed);
    this.session.sendRealtimeInput({ text: trimmed });
  }

  setMicEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    this.mic.setMuted(!enabled);
  }

  async pause() {
    this.paused = true;
    this.mic.setMuted(true);
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
    if (this.playLocalAudio) await this.player.pause();
  }

  async resume() {
    this.paused = false;
    if (this.micEnabled) this.mic.setMuted(false);
    if (this.playLocalAudio) await this.player.resume();
  }

  close() {
    this.closing = true;
    this.flush();
    this.mic.stop();
    this.player.close();
    this.session?.close();
    this.session = null;
  }

  private fail(message: string) {
    if (this.closing) return;
    this.handlers.onError(message);
  }

  private setAgentSpeaking(speaking: boolean) {
    this.agentSpeaking = speaking;
    if (this.micEnabled && !this.paused) this.mic.setMuted(speaking);
  }

  private async onMessage(message: LiveServerMessage) {
    const content = message.serverContent;
    if (content) {
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          this.setAgentSpeaking(true);
          if (this.playLocalAudio) this.player.enqueue(part.inlineData.data);
          this.handlers.onPcm?.(part.inlineData.data);
        }
      }
      // Ignore mic STT when the candidate replies by typing (we already recorded the turn).
      if (content.inputTranscription?.text && this.micEnabled) {
        this.caption("candidate", content.inputTranscription.text);
      }
      if (content.outputTranscription?.text) {
        this.setAgentSpeaking(true);
        this.caption("agent", content.outputTranscription.text);
      }
      if (content.interrupted) {
        // With NO_INTERRUPTION this should be rare; still clear local playback if it happens.
        if (this.playLocalAudio) this.player.interrupt();
        this.flush("agent");
        this.setAgentSpeaking(false);
      }
      if (content.turnComplete) {
        this.flush();
        // Wait until local audio (if any) has finished before opening the mic again.
        const openMic = () => {
          if (this.closing) return;
          if (this.playLocalAudio && this.player.isPlaying) {
            setTimeout(openMic, 150);
            return;
          }
          this.setAgentSpeaking(false);
        };
        openMic();
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
      if (text) this.handlers.onTurn(role, text);
    }
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
        });
        const data = (await res.json()) as { result?: string; error?: string };
        output = data.result ?? data.error ?? output;
      } catch {
        /* keep the default output; the conversation continues */
      }
      if (call.name === "end_interview") this.endRequested = true;
      functionResponses.push({ id: call.id, name: call.name, response: { output } });
    }
    this.session?.sendToolResponse({ functionResponses });
    // If no closing turn follows, end anyway after a short wait.
    if (this.endRequested) setTimeout(() => this.fireEnd(), 6000);
  }

  /** Waits for the goodbye to finish playing, then asks the UI to end. */
  private fireEnd() {
    if (this.endFired) return;
    this.endFired = true;
    const wait = () => {
      if (this.closing) return;
      if (this.playLocalAudio && this.player.isPlaying) setTimeout(wait, 250);
      else this.handlers.onEndRequested();
    };
    wait();
  }
}
