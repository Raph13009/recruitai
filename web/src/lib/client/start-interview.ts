import { PcmPlayer } from "@/lib/client/audio";
import { connectAvatar } from "@/lib/client/avatar";
import { DemoVoiceEngine } from "@/lib/client/demo-voice";
import { postJson, type EngineHandlers, type InterviewEngine } from "@/lib/client/engine";
import { GeminiEngine, type LiveTokenInfo } from "@/lib/client/gemini-live";

interface LiveResponse {
  engine: "gemini" | "demo";
  persona: string;
  masculineVoice?: boolean;
  resumed?: boolean;
  gemini?: LiveTokenInfo;
  avatar?: { sessionToken: string; sandbox: boolean } | null;
  notice?: string | null;
}

export interface StartOptions {
  /** The interview link token. */
  token: string;
  /** Ask for the video avatar when the server offers one. */
  wantVideo: boolean;
  /** Element that receives the avatar's video and audio. */
  video: HTMLVideoElement | null;
  micDeviceId?: string;
  /** False when the candidate answers in writing: the interviewer still speaks, no mic is opened. */
  micEnabled?: boolean;
  handlers: EngineHandlers;
}

const AVATAR_LOST = "La vidéo s'est interrompue. L'entretien continue en audio.";
const SANDBOX_ENDED =
  "La vidéo de démonstration s'arrête après environ une minute (bac à sable de l'avatar). L'entretien continue en audio.";

export interface StartedInterview {
  engine: InterviewEngine;
  /**
   * The browser blocked the sound: the interviewer waits for a click ("Faire parler Camille")
   * before speaking, so the candidate does not miss the opening line.
   */
  needsClick: boolean;
}

/** The interviewer speaks right away when the candidate can hear her, else after a click. */
async function opening(engine: InterviewEngine): Promise<StartedInterview> {
  const audible = await engine.unlock();
  if (audible) engine.begin();
  return { engine, needsClick: !audible };
}

/**
 * Opens the call: asks the server which engine to run, connects the video avatar when there is
 * one, then the voice. Must be called straight from a click handler so audio is allowed to start.
 */
export async function startInterview(opts: StartOptions): Promise<StartedInterview> {
  // Created before any await: the AudioContext needs the user gesture.
  const speaker = new PcmPlayer();

  let info: LiveResponse;
  try {
    info = await postJson<LiveResponse>(`/api/sessions/${opts.token}/live`, { video: opts.wantVideo });
  } catch (err) {
    speaker.close();
    throw err;
  }

  if (info.engine === "demo" || !info.gemini) {
    speaker.close();
    const demo = new DemoVoiceEngine(opts.token, opts.handlers, {
      masculineVoice: info.masculineVoice === true,
      micEnabled: opts.micEnabled,
    });
    await demo.start();
    return opening(demo);
  }

  const engine = new GeminiEngine(opts.token, opts.handlers, speaker);
  if (info.notice) opts.handlers.onNotice(info.notice);

  if (info.avatar && opts.video) {
    const sandbox = info.avatar.sandbox;
    try {
      const avatar = await connectAvatar({
        sessionToken: info.avatar.sessionToken,
        video: opts.video,
        onDisconnected: () => engine.dropAvatar(sandbox ? SANDBOX_ENDED : AVATAR_LOST),
      });
      engine.useAvatar(avatar);
    } catch {
      opts.handlers.onNotice("L'avatar vidéo n'est pas disponible pour le moment. L'entretien continue en audio.");
    }
  }

  try {
    await engine.connect(info.gemini, { micDeviceId: opts.micDeviceId, resumed: info.resumed, micEnabled: opts.micEnabled });
  } catch (err) {
    engine.close();
    throw err instanceof Error && err.name === "NotAllowedError"
      ? new Error("Le micro est bloqué. Autorisez-le dans la barre d'adresse du navigateur, puis réessayez.")
      : new Error("Impossible de démarrer la voix de l'entretien. Vérifiez votre connexion, puis réessayez.");
  }
  return opening(engine);
}
