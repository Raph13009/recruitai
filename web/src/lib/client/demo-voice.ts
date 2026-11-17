import { postJson, type EngineHandlers, type InterviewEngine } from "@/lib/client/engine";
import { probeSpeechUnlock } from "@/lib/client/media-unlock";
import type { DemoStep } from "@/lib/interview/demo-engine";
import type { InterviewProgress } from "@/lib/interview/progress";

// Demo interviewer for a machine with no API key: the dialogue runs on the server
// (/api/sessions/[token]/demo, rule-based) and this file only gives it a voice and ears with the
// browser's own speech services. It is turn-based (no barge-in) and the voice is the system's:
// the real-time voice and the video avatar need the Gemini and LiveAvatar keys.

interface DemoReply {
  say: string;
  step: DemoStep;
  done: boolean;
  progress: InterviewProgress;
}

// Minimal typings for the Web Speech recognition API (not in TypeScript's DOM lib).
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when this browser can turn the candidate's speech into text for the demo. */
export const demoSpeechInputAvailable = () => recognitionCtor() !== null;

const FEMALE_HINTS = /am[ée]lie|audrey|marie|aur[ée]lie|c[ée]line|julie|denise|google fran[çc]ais/i;
const MALE_HINTS = /thomas|daniel|jacques|henri|paul|nicolas/i;

function pickVoice(voices: SpeechSynthesisVoice[], masculine: boolean): SpeechSynthesisVoice | null {
  const french = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  if (!french.length) return null;
  const hint = masculine ? MALE_HINTS : FEMALE_HINTS;
  return (
    french.find((v) => v.lang === "fr-FR" && hint.test(v.name)) ??
    french.find((v) => hint.test(v.name)) ??
    french.find((v) => v.lang === "fr-FR") ??
    french[0]
  );
}

async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return [];
  const now = speechSynthesis.getVoices();
  if (now.length) return now;
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

/** Short pieces: some browsers cut long utterances off after about fifteen seconds. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

export class DemoVoiceEngine implements InterviewEngine {
  readonly kind = "demo" as const;
  readonly video = false;

  private step: DemoStep = "intro";
  private closed = false;
  private muted = false;
  private busy = false; // waiting for the server or speaking
  private speaking = false;
  private voice: SpeechSynthesisVoice | null = null;
  private recognition: Recognition | null = null;
  private recognizing = false;
  private speechInputBroken = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sessionToken: string,
    private readonly handlers: EngineHandlers,
    private readonly opts: { masculineVoice: boolean; micEnabled?: boolean },
  ) {
    // Without a mic the candidate types; the interviewer still speaks aloud.
    this.muted = opts.micEnabled === false;
  }

  private opening: DemoReply | null = null;

  /** Loads the voice and the opening line; `begin()` says it. */
  async start(): Promise<void> {
    this.voice = pickVoice(await loadVoices(), this.opts.masculineVoice);
    this.opening = await postJson<DemoReply>(`/api/sessions/${this.sessionToken}/demo`, { step: "start" });
    if (!this.muted && !demoSpeechInputAvailable()) {
      this.handlers.onNotice("Ce navigateur ne propose pas la reconnaissance vocale : répondez par écrit avec le bouton clavier.");
    }
  }

  async unlock(): Promise<boolean> {
    // iOS Safari blocks speak() outside a gesture; return false so the UI shows "Faire parler".
    return probeSpeechUnlock();
  }

  begin() {
    const opening = this.opening;
    if (!opening || this.closed) return;
    this.opening = null;
    // Do not block the caller while the opening line is spoken. Answers queue up behind it.
    this.queue = this.deliver(opening);
  }

  async setMicMuted(muted: boolean): Promise<boolean> {
    this.muted = muted;
    if (muted) this.stopListening();
    else if (!this.busy) this.listen();
    // The browser asks for the mic itself; a refusal shows up as a notice from the recognition.
    return true;
  }

  sendText(text: string) {
    const clean = text.trim();
    if (!clean || this.closed) return;
    // The interviewer finishes her sentence first (no interruption); the answer follows.
    this.queue = this.queue.then(() => this.answer(clean));
  }

  agentLevel(): number {
    // The system voice gives no signal to analyse: animate a gentle pulse while it speaks.
    return this.speaking ? 0.35 + 0.25 * Math.sin(performance.now() / 110) + 0.1 * Math.sin(performance.now() / 37) : 0;
  }

  settle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  close() {
    this.closed = true;
    this.stopListening();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  // ---------- internals ----------

  private async answer(text: string) {
    if (this.closed) return;
    this.busy = true;
    this.stopListening();
    this.handlers.onCandidateSpeaking(false);
    this.handlers.onTurn("candidate", text);
    try {
      const reply = await postJson<DemoReply>(`/api/sessions/${this.sessionToken}/demo`, { step: this.step, text });
      await this.deliver(reply);
    } catch (err) {
      this.busy = false;
      if (!this.closed) this.handlers.onError(err instanceof Error ? err.message : "Le mode démo a rencontré une erreur.");
    }
  }

  private async deliver(reply: DemoReply) {
    this.busy = true;
    this.step = reply.step;
    this.handlers.onProgress(reply.progress);
    this.handlers.onCaption("agent", reply.say);
    await this.speak(reply.say);
    if (this.closed) return;
    this.handlers.onTurn("agent", reply.say);
    this.busy = false;
    if (reply.done) this.handlers.onEnded();
    else if (!this.muted) this.listen();
  }

  private setSpeaking(speaking: boolean) {
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.handlers.onAgentSpeaking(speaking);
  }

  private async speak(text: string): Promise<void> {
    this.setSpeaking(true);
    const canSpeak = typeof speechSynthesis !== "undefined" && this.voice !== null;
    for (const sentence of sentences(text)) {
      if (this.closed) break;
      // Reading time when there is no voice to wait for, and a safety net when the browser never reports the end.
      const estimateMs = 500 + sentence.length * 55;
      if (!canSpeak) {
        await this.pause(estimateMs);
        continue;
      }
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.voice = this.voice;
        utterance.lang = this.voice?.lang ?? "fr-FR";
        utterance.rate = 1.02;
        const timer = setTimeout(resolve, estimateMs * 2 + 4000);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        speechSynthesis.speak(utterance);
      });
    }
    this.setSpeaking(false);
  }

  /** Waits `ms`, or less when the engine closes. */
  private async pause(ms: number) {
    const until = performance.now() + ms;
    while (!this.closed && performance.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }

  private listen() {
    const Ctor = recognitionCtor();
    if (!Ctor || this.closed || this.muted || this.busy || this.recognizing || this.speechInputBroken) return;

    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      const heard = `${finalText} ${interim}`.trim();
      if (heard) this.handlers.onCaption("candidate", heard);
    };
    recognition.onspeechstart = () => this.handlers.onCandidateSpeaking(true);
    recognition.onspeechend = () => this.handlers.onCandidateSpeaking(false);
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "network") {
        this.speechInputBroken = true;
        if (!this.closed) {
          this.handlers.onNotice("La reconnaissance vocale n'est pas disponible ici : répondez par écrit avec le bouton clavier.");
        }
      }
    };
    recognition.onend = () => {
      this.recognizing = false;
      this.recognition = null;
      this.handlers.onCandidateSpeaking(false);
      const heard = finalText.trim();
      if (heard) this.sendText(heard);
      // Silence: keep listening until the candidate answers.
      else setTimeout(() => this.listen(), 250);
    };

    try {
      recognition.start();
      this.recognition = recognition;
      this.recognizing = true;
    } catch {
      /* already started by a previous call */
    }
  }

  private stopListening() {
    const recognition = this.recognition;
    this.recognition = null;
    this.recognizing = false;
    if (!recognition) return;
    recognition.onend = null;
    recognition.onresult = null;
    try {
      recognition.abort();
    } catch {
      /* not running */
    }
  }
}

