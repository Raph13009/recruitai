import { describe, expect, it } from "vitest";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit in a window, then resets", () => {
    const key = `test:${Math.random()}`;
    const t0 = 1_000_000;
    expect(rateLimit(key, 2, 1000, t0)).toBe(true);
    expect(rateLimit(key, 2, 1000, t0 + 10)).toBe(true);
    expect(rateLimit(key, 2, 1000, t0 + 20)).toBe(false);
    expect(rateLimit(key, 2, 1000, t0 + 1000)).toBe(true);
  });

  it("reads the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientAddress(new Headers())).toBe("local");
  });
});
