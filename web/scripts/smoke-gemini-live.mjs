/**
 * Local smoke test for Gemini Live (French audio).
 * Usage: node --env-file=.env.local scripts/smoke-gemini-live.mjs
 * Never logs API keys.
 */
import { GoogleGenAI, Modality } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || process.env.google_api_key;
if (!apiKey) {
  console.error("GEMINI_API_KEY missing");
  process.exit(1);
}

const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
const voice = process.env.GEMINI_VOICE || "Aoede";

const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });

let gotAudio = false;
let transcript = "";

await new Promise(async (resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout waiting for live response")), 45_000);
  try {
    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          "Tu es Camille, recruteuse IA pour Interim Express. Le poste est à Lyon, pas à Paris. Réponds en français, très brièvement. Ne scores pas.",
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (m) => {
          const c = m.serverContent;
          if (!c) return;
          for (const p of c.modelTurn?.parts ?? []) {
            if (p.inlineData?.data) gotAudio = true;
          }
          if (c.outputTranscription?.text) transcript += c.outputTranscription.text;
          if (c.turnComplete) {
            clearTimeout(timer);
            session.close();
            resolve(undefined);
          }
        },
        onerror: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      },
    });
    session.sendRealtimeInput({ text: "Bonjour Camille, c'est sur Paris le poste ?" });
  } catch (err) {
    clearTimeout(timer);
    reject(err);
  }
});

const result = {
  model,
  gotAudio,
  transcript_preview: transcript.slice(0, 280),
  mentions_lyon: /lyon/i.test(transcript),
  ok: gotAudio || transcript.length > 0,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 2);
