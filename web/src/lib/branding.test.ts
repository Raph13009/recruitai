// web/src/lib/branding.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT, defaultBranding, isAccentColor, withBranding,
} from "@/lib/branding";

describe("branding", () => {
  it("defaults to product teal and null assets", () => {
    expect(defaultBranding()).toEqual({
      logo_url: null,
      banner_url: null,
      accent_color: DEFAULT_ACCENT,
    });
  });

  it("accepts only #RRGGBB accents", () => {
    expect(isAccentColor("#0f6b5c")).toBe(true);
    expect(isAccentColor("#0F6B5C")).toBe(true);
    expect(isAccentColor("#fff")).toBe(false);
    expect(isAccentColor("0f6b5c")).toBe(false);
    expect(isAccentColor("red")).toBe(false);
  });

  it("fills missing branding on legacy agency rows", () => {
    const agency = withBranding({
      id: "a1",
      name: "Agence",
      interviewer: {
        persona_name: "Camille",
        voice: "Aoede",
        video_enabled: true,
        avatar_id: null,
        avatar_name: null,
        avatar_preview_url: null,
      },
      created_at: "2026-01-01T00:00:00.000Z",
      branding: null,
    });
    expect(agency.branding.accent_color).toBe(DEFAULT_ACCENT);
    expect(agency.branding.logo_url).toBeNull();
  });
});