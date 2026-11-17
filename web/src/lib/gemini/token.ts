import { ActivityHandling, GoogleGenAI, Modality, StartSensitivity, type LiveConnectConfig } from "@google/genai";
import { env, requireEnv } from "@/lib/env";
import type { CandidateMemory } from "@/lib/interview/memory";
import { buildResumeNote, buildSystemInstruction } from "@/lib/interview/prompt";
import { interviewTools } from "@/lib/interview/tools";
import type { JobBrief } from "@/lib/job";

export interface LiveTokenResult {
  token: string;
  model: string;
  voice: string;
  /** Config the browser passes to ai.live.connect (already locked inside the token when `locked` is true). */
  config: LiveConnectConfig;
  locked: boolean;
  expiresAt: string;
}

const SESSION_MINUTES = 30;

/**
 * Turn-taking, from Raphaël's "Stop noise from interrupting Camille" (2622617): the interviewer is
 * never interrupted (room noise or the echo of her own voice used to cut her off mid-sentence),
 * speech must last 300 ms and be clear before it counts, and the candidate may pause 1.2 s while
 * looking for words before the turn passes to the interviewer.
 */
const END_OF_SPEECH_SILENCE_MS = 1200;
const SPEECH_PREFIX_MS = 300;

/** Ephemeral token for the browser. The real API key never leaves the server. */
export async function createLiveToken(input: {
  job: JobBrief;
  persona: string;
  voice: string;
  /** Set when the call restarts: what was already collected, so the interviewer resumes. */
  resume?: CandidateMemory;
}): Promise<LiveTokenResult> {
  const apiKey = requireEnv(env.geminiApiKey(), "GEMINI_API_KEY");
  const model = env.geminiModel();
  const { voice } = input;

  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction:
      buildSystemInstruction(input.job, input.persona, voice) + (input.resume ? buildResumeNote(input.resume) : ""),
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    tools: [{ functionDeclarations: interviewTools }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      activityHandling: ActivityHandling.NO_INTERRUPTION,
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        prefixPaddingMs: SPEECH_PREFIX_MS,
        silenceDurationMs: END_OF_SPEECH_SILENCE_MS,
      },
    },
  };

  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
  const expireTime = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60_000).toISOString();

  // Preferred: lock model, modality, prompt and tools inside the token so the browser cannot change them.
  try {
    const locked = await ai.authTokens.create({
      config: { uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints: { model, config } },
    });
    if (locked.name) return { token: locked.name, model, voice, config, locked: true, expiresAt: expireTime };
  } catch {
    // Fall through to an unlocked token; the browser still sends `config` itself.
  }

  const open = await ai.authTokens.create({ config: { uses: 1, expireTime, newSessionExpireTime } });
  if (!open.name) throw new Error("Jeton Gemini indisponible.");
  return { token: open.name, model, voice, config, locked: false, expiresAt: expireTime };
}
