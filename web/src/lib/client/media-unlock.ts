/**
 * Mobile Safari (and some Chromium builds) only unlock playback inside a user gesture.
 * Helpers here are safe to call from a click handler before any `await`.
 */

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/** Standard AudioContext, or the older webkit-prefixed constructor on iOS Safari. */
export function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Creates an AudioContext and resumes it when the browser starts it suspended. */
export async function createResumedAudioContext(options?: AudioContextOptions): Promise<AudioContext> {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) throw new Error("AudioContext indisponible sur ce navigateur.");
  const ctx = new Ctor(options);
  if (ctx.state === "suspended") {
    await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 400))]);
  }
  return ctx;
}

function speechApis(): {
  synthesis: SpeechSynthesis;
  Utterance: typeof SpeechSynthesisUtterance;
} | null {
  if (typeof globalThis === "undefined") return null;
  const synthesis = (globalThis as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (globalThis as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
    .SpeechSynthesisUtterance;
  if (!synthesis || !Utterance) return null;
  return { synthesis, Utterance };
}

/**
 * Sync unlock for `speechSynthesis` (iOS drops `speak()` after the gesture expires).
 * Call this at the start of the join click, before any network await.
 */
export function primeSpeechSynthesis(): boolean {
  const apis = speechApis();
  if (!apis) return false;
  try {
    apis.synthesis.cancel();
    const utterance = new apis.Utterance(" ");
    utterance.volume = 0;
    utterance.lang = "fr-FR";
    apis.synthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Probe whether TTS is actually allowed; used by the demo engine's unlock(). */
export function probeSpeechUnlock(): Promise<boolean> {
  const apis = speechApis();
  if (!apis) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      apis.synthesis.cancel();
      const utterance = new apis.Utterance(" ");
      utterance.volume = 0;
      utterance.lang = "fr-FR";
      utterance.onstart = () => done(true);
      utterance.onend = () => done(true);
      utterance.onerror = () => done(false);
      apis.synthesis.speak(utterance);
      setTimeout(() => {
        done(apis.synthesis.speaking || apis.synthesis.pending);
      }, 250);
    } catch {
      done(false);
    }
  });
}
