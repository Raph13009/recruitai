import { describe, expect, it } from "vitest";
import { applyFact, emptyMemory, missingFields } from "@/lib/interview/memory";
import { progressOf } from "@/lib/interview/progress";
import { buildOpeningLine, buildResumeNote, buildSystemInstruction, ofJob, ofName, renderDisclosure } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { answerJobQuestion } from "@/lib/interview/tools";
import { formatFrDate, getDemoJobFacts, isIsoDate, nextMonday, resolveStartDate, toJobBrief } from "@/lib/job";

const TODAY = "2026-11-17";
const job = toJobBrief(getDemoJobFacts(), TODAY);
const HOURS = job.working_hours;

describe("job dates", () => {
  it("starts the Monday after today, a full week ahead on Mondays", () => {
    expect(nextMonday("2026-11-17")).toBe("2026-11-23");
    expect(nextMonday("2026-11-23")).toBe("2026-11-30");
    expect(nextMonday("2026-12-27")).toBe("2026-12-28");
  });

  it("supports a fixed start date", () => {
    expect(resolveStartDate("2027-01-04", TODAY)).toBe("2027-01-04");
    expect(resolveStartDate("next_monday", TODAY)).toBe("2026-11-23");
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(formatFrDate("2026-12-01")).toBe("1er décembre 2026");
  });
});

describe("memory", () => {
  it("keeps the raw words and drops a normalization it cannot trust", () => {
    let memory = applyFact(emptyMemory(), { field: "availability", raw: "demain", normalized: "tomorrow" }, HOURS);
    memory = applyFact(memory, { field: "shift_preference", raw: "la nuit", normalized: "22:00–6:00" }, HOURS);
    memory = applyFact(memory, { field: "salary_expectation", raw: "beaucoup", normalized: "beaucoup" }, HOURS);
    expect(memory.availability).toMatchObject({ raw: "demain", normalized: null });
    expect(memory.shift_preference).toMatchObject({ raw: "la nuit", normalized: null });
    expect(memory.salary_expectation).toMatchObject({ raw: "beaucoup", normalized: null });
  });

  it("tracks progress and what is still missing", () => {
    const memory = applyFact(emptyMemory(), { field: "experience_sector", raw: "entrepôt", normalized: "logistique" }, HOURS);
    expect(progressOf(memory)).toEqual({ experience: true, availability: false, shift: false, salary: false });
    expect(missingFields(memory)).toEqual(["availability", "shift_preference", "salary_expectation"]);
  });
});

describe("prompt", () => {
  it("elides agency names", () => {
    expect(ofName("Interim Express")).toBe("d'Interim Express");
    expect(ofName("Lyon Intérim")).toBe("de Lyon Intérim");
  });

  it("elides the job title correctly", () => {
    expect(ofJob("Agent de quai")).toBe("d'agent de quai");
    expect(ofJob("Manutentionnaire")).toBe("de manutentionnaire");
    expect(ofJob("Hôte de caisse")).toBe("d'hôte de caisse");
  });

  it("introduces the persona as an AI and follows the voice for grammar", () => {
    const opening = buildOpeningLine(job, "Sam");
    expect(opening).toContain("je suis Sam, votre assistante de recrutement IA");
    expect(opening).toContain("Nous allons échanger pour le poste");
    expect(opening).not.toMatch(/êtes-vous prêt|on commence \?/i);
    const female = buildSystemInstruction(job, "Camille", "Aoede");
    expect(female).toContain("Tu es Camille, assistante de recrutement IA");
    expect(female).toContain("accorde au féminin");
    expect(female).toContain("Lieu : Lyon");
    expect(female).toContain("NE RESTE JAMAIS SILENCIEUSE");
    expect(buildSystemInstruction(job, "Camille", "Charon")).toContain("accorde au masculin");
    expect(buildSystemInstruction(job, "Camille", "Unknown")).toContain("évite les accords genrés");
  });

  it("tells the interviewer what was already collected when resuming", () => {
    let memory = applyFact(emptyMemory(), { field: "availability", raw: "tout de suite", normalized: "immediate" }, HOURS);
    memory = applyFact(memory, { field: "name", raw: "Je m'appelle Léa", normalized: "Léa" }, HOURS);
    const note = buildResumeNote(memory);
    expect(note).toContain("Ne refais pas l'ouverture");
    expect(note).toContain("« tout de suite »");
    expect(note).toContain("« Je m'appelle Léa »");
  });

  it("renders the disclosure with the persona name", () => {
    expect(renderDisclosure("Vous allez échanger avec {persona}, une IA.", "Alex")).toBe("Vous allez échanger avec Alex, une IA.");
  });
});

describe("tools and report", () => {
  it("answers only from the job sheet", () => {
    expect(answerJobQuestion("location", job)).toBe("Le poste est à Lyon.");
    expect(answerJobQuestion("start_date", job)).toBe("La mission commence le 23 novembre 2026.");
    expect(answerJobQuestion("other", job)).toContain("pas dans la fiche");
  });

  it("flags differences for a human, never scores", () => {
    let memory = applyFact(emptyMemory(), { field: "availability", raw: "début janvier", normalized: "2027-01-04" }, HOURS);
    memory = applyFact(memory, { field: "salary_expectation", raw: "14 euros", normalized: "14" }, HOURS);
    const report = buildReport({
      sessionId: "s1", candidateLabel: "C-1", isSynthetic: true, mode: "avatar", engine: "gemini",
      endReason: "left", durationSeconds: 200, job, memory, transcriptTurns: 6,
    });
    expect(report.points_to_review).toEqual([
      "Disponibilité déclarée à partir du 4 janvier 2027, après le début de mission (23 novembre 2026).",
      "Attente salariale déclarée : 14,00 € brut/h. Salaire de la fiche : 12,50 € brut/h.",
      "Le candidat a quitté l'entretien avant la clôture : le recueil peut être incomplet.",
    ]);
    expect(report.not_collected).toEqual(["experience_sector", "shift_preference"]);
    expect(report.scoring).toBeNull();
    expect(report.ranking).toBeNull();
    expect(report.hiring_recommendation).toBeNull();
  });
});
