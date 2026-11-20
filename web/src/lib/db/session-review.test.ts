import { describe, expect, it } from "vitest";
import { availabilityLabel, isNextAction, isRecruiterStatus } from "@/lib/db/session-review";
import { emptyMemory, type CandidateMemory } from "@/lib/interview/memory";

describe("session review helpers", () => {
  it("recognizes recruiter statuses and next actions", () => {
    expect(isRecruiterStatus("to_review")).toBe(true);
    expect(isRecruiterStatus("completed")).toBe(false);
    expect(isNextAction("contact")).toBe(true);
    expect(isNextAction("none")).toBe(false);
  });

  it("labels availability from memory", () => {
    expect(availabilityLabel(emptyMemory())).toBe("Non renseignée");
    expect(availabilityLabel(undefined)).toBe("Non renseignée");

    const immediate: CandidateMemory = {
      ...emptyMemory(),
      availability: { raw: "tout de suite", normalized: "immediate", recorded_at: "2026-11-17T10:00:00.000Z" },
    };
    expect(availabilityLabel(immediate)).toBe("Immédiate");

    const dated: CandidateMemory = {
      ...emptyMemory(),
      availability: { raw: "début janvier", normalized: "2027-01-04", recorded_at: "2026-11-17T10:00:00.000Z" },
    };
    expect(availabilityLabel(dated)).toMatch(/À partir du/);

    const rawOnly: CandidateMemory = {
      ...emptyMemory(),
      availability: { raw: "je verrai bien", normalized: null, recorded_at: "2026-11-17T10:00:00.000Z" },
    };
    expect(availabilityLabel(rawOnly)).toBe("je verrai bien");
  });
});
