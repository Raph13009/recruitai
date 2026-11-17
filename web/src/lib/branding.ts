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