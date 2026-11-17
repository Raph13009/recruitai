import { GoogleGenAI, Modality, type LiveConnectConfig } from "@google/genai";
import { env, requireEnv } from "@/lib/env";
import { buildSystemInstruction } from "@/lib/interview/prompt";
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

/** Ephemeral token for the browser. The real API key never leaves the server. */
export async function createLiveToken(
  job: JobBrief,
  opts: { voice?: string } = {},
): Promise<LiveTokenResult> {
  const apiKey = requireEnv(env.geminiApiKey(), "GEMINI_API_KEY");
  const model = env.geminiModel();
  const voice = opts.voice?.trim() || env.geminiVoice();

  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: buildSystemInstruction(job),
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    tools: [{ functionDeclarations: interviewTools }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
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
