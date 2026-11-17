import { afterEach, describe, expect, it, vi } from "vitest";
import { getAudioContextConstructor, primeSpeechSynthesis, probeSpeechUnlock } from "@/lib/client/media-unlock";

describe("getAudioContextConstructor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers standard AudioContext when present", () => {
    const AudioContext = vi.fn();
    vi.stubGlobal("window", { AudioContext, webkitAudioContext: vi.fn() });
    expect(getAudioContextConstructor()).toBe(AudioContext);
  });

  it("falls back to webkitAudioContext on older Safari", () => {
    const webkitAudioContext = vi.fn();
    vi.stubGlobal("window", { webkitAudioContext });
    expect(getAudioContextConstructor()).toBe(webkitAudioContext);
  });
});

describe("primeSpeechSynthesis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when speechSynthesis is missing", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    expect(primeSpeechSynthesis()).toBe(false);
  });

  it("speaks a silent utterance synchronously to unlock iOS TTS", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel, speaking: false, pending: false });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text = "";
        volume = 1;
        lang = "";
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    expect(primeSpeechSynthesis()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as { volume: number; lang: string };
    expect(utterance.volume).toBe(0);
    expect(utterance.lang).toBe("fr-FR");
  });
});

describe("probeSpeechUnlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves false when speechSynthesis is missing", async () => {
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    await expect(probeSpeechUnlock()).resolves.toBe(false);
  });

  it("resolves true when the silent utterance starts", async () => {
    const speak = vi.fn((utterance: { onstart: (() => void) | null }) => {
      utterance.onstart?.();
    });
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), speaking: false, pending: false });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        volume = 1;
        lang = "";
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
      },
    );
    await expect(probeSpeechUnlock()).resolves.toBe(true);
  });

  it("resolves false when the silent utterance errors", async () => {
    const speak = vi.fn((utterance: { onerror: (() => void) | null }) => {
      utterance.onerror?.();
    });
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), speaking: false, pending: false });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        volume = 1;
        lang = "";
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
      },
    );
    await expect(probeSpeechUnlock()).resolves.toBe(false);
  });
});
