import type { Agency, AgencyBranding } from "@/lib/db/types";

export const DEFAULT_ACCENT = "#0f6b5c";
export const LOGO_MAX_BYTES = 1_048_576;
export const BANNER_MAX_BYTES = 2_097_152;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function defaultBranding(): AgencyBranding {
  return { logo_url: null, banner_url: null, accent_color: DEFAULT_ACCENT };
}

export function isAccentColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function withBranding<
  T extends Omit<Agency, "branding"> & { branding?: AgencyBranding | null },
>(agency: T): Agency {
  return {
    ...agency,
    branding: { ...defaultBranding(), ...(agency.branding ?? {}) },
  } as Agency;
}

/** Readable text colour (white or deep teal) on top of an accent background. */
export function accentForeground(hex: string): "#ffffff" | "#0a1f1b" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0a1f1b" : "#ffffff";
}

/** CSS variables that recolour buttons, rings and highlights with an agency accent. */
export function accentVars(hex: string): Record<string, string> {
  const accent = isAccentColor(hex) ? hex : DEFAULT_ACCENT;
  const foreground = accentForeground(accent);
  return {
    "--primary": accent,
    "--primary-foreground": foreground,
    "--brand": accent,
    "--brand-foreground": foreground,
    "--ring": accent,
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": foreground,
  };
}
