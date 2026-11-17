// Curated Gemini Live voices offered in the recruiter UI. Names and tones come from Google's
// prebuilt voice list; the tone is the official descriptor, translated.
// Any other Gemini voice still works through GEMINI_VOICE or a stored setting: it is then
// treated as "neutral" for grammar.

export type VoiceGender = "f" | "m";

export interface VoiceOption {
  id: string;
  gender: VoiceGender;
  /** Official descriptor, in French. */
  tone: string;
}

export const VOICES: VoiceOption[] = [
  { id: "Aoede", gender: "f", tone: "Aérienne" },
  { id: "Kore", gender: "f", tone: "Assurée" },
  { id: "Leda", gender: "f", tone: "Jeune" },
  { id: "Zephyr", gender: "f", tone: "Lumineuse" },
  { id: "Puck", gender: "m", tone: "Enjoué" },
  { id: "Charon", gender: "m", tone: "Posé" },
  { id: "Orus", gender: "m", tone: "Assuré" },
  { id: "Fenrir", gender: "m", tone: "Dynamique" },
];

export const voiceGender = (voice: string): VoiceGender | null =>
  VOICES.find((v) => v.id === voice)?.gender ?? null;
