import { describe, expect, it } from "vitest";
import { sessionStatusLabel } from "@/components/recruiter/status-badge";

describe("sessionStatusLabel", () => {
  it("maps created to Invité", () => {
    expect(sessionStatusLabel("created")).toBe("Invité");
  });

  it("maps in_progress to En cours", () => {
    expect(sessionStatusLabel("in_progress")).toBe("En cours");
  });

  it("maps completed to Terminé", () => {
    expect(sessionStatusLabel("completed", "completed")).toBe("Terminé");
    expect(sessionStatusLabel("completed", null)).toBe("Terminé");
  });

  it("maps completed + left to Interrompu", () => {
    expect(sessionStatusLabel("completed", "left")).toBe("Interrompu");
  });
});
