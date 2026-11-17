import { describe, expect, it } from "vitest";
import { assertBrandingImage } from "@/lib/branding/storage";

describe("assertBrandingImage", () => {
  it("rejects wrong mime", () => {
    const file = new File([new Uint8Array([1])], "x.svg", { type: "image/svg+xml" });
    expect(assertBrandingImage(file, "logo")).toMatch(/png|jpeg|webp/i);
  });

  it("rejects oversized logo", () => {
    const file = new File([new Uint8Array(1_048_577)], "big.png", { type: "image/png" });
    expect(assertBrandingImage(file, "logo")).toMatch(/1\s*Mo|1\s*MB|trop/i);
  });

  it("accepts a banner above the logo limit", () => {
    const file = new File([new Uint8Array(1_048_577)], "b.png", { type: "image/png" });
    expect(assertBrandingImage(file, "banner")).toBeNull();
  });

  it("rejects oversized banner", () => {
    const file = new File([new Uint8Array(2_097_153)], "b.webp", { type: "image/webp" });
    expect(assertBrandingImage(file, "banner")).toMatch(/2\s*Mo/);
  });

  it("accepts a small png logo", () => {
    const file = new File([new Uint8Array([1])], "l.png", { type: "image/png" });
    expect(assertBrandingImage(file, "logo")).toBeNull();
  });
});
