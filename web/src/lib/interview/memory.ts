import { z } from "zod";

// Typed slots for what the candidate actually said. Nothing is inferred or invented:
// `raw` is the candidate's own wording, `normalized` is only kept when it passes validation.

export const FACT_FIELDS = [
  "name",
  "experience_sector",
  "experience_tasks",
  "availability",
  "shift_preference",
  "salary_expectation",
  "candidate_question",
] as const;
export type FactField = (typeof FACT_FIELDS)[number];

export interface Fact {
  raw: string;
  normalized: string | null;
  recorded_at: string;
}

export interface CandidateMemory {
  name: Fact | null;
  experience_sector: Fact[];
  experience_tasks: Fact[];
  availability: Fact | null;
  shift_preference: Fact | null;
  salary_expectation: Fact | null;
  candidate_question: Fact[];
}

export const LIST_FIELDS = ["experience_sector", "experience_tasks", "candidate_question"] as const;

export function emptyMemory(): CandidateMemory {
  return {
    name: null,
    experience_sector: [],
    experience_tasks: [],
    availability: null,
    shift_preference: null,
    salary_expectation: null,
    candidate_question: [],
  };
}

export const factInputSchema = z.object({
  field: z.enum(FACT_FIELDS),
  // The candidate's own words, as heard.
  raw: z.string().trim().min(1).max(500),
  normalized: z.string().trim().max(120).optional().nullable(),
});
export type FactInput = z.infer<typeof factInputSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep `normalized` only when it fits the slot's allowed format; otherwise drop it (never guess). */
function normalize(field: FactField, normalized: string | null | undefined, workingHours: string[]): string | null {
  const value = normalized?.trim();
  if (!value) return null;
  switch (field) {
    case "availability":
      return value === "immediate" || (ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))) ? value : null;
    case "shift_preference":
      return [...workingHours, "les deux", "aucun"].includes(value) ? value : null;
    case "salary_expectation": {
      const n = Number(value.replace(",", "."));
      return Number.isFinite(n) && n > 0 && n < 1000 ? String(n) : null;
    }
    default:
      return value;
  }
}

/** Pure: returns a new memory with the fact applied. Single-value slots are overwritten by the latest statement. */
export function applyFact(
  memory: CandidateMemory,
  input: FactInput,
  workingHours: string[],
  now: Date = new Date(),
): CandidateMemory {
  const fact: Fact = {
    raw: input.raw,
    normalized: normalize(input.field, input.normalized, workingHours),
    recorded_at: now.toISOString(),
  };
  switch (input.field) {
    case "experience_sector":
    case "experience_tasks":
    case "candidate_question":
      return { ...memory, [input.field]: [...memory[input.field], fact] };
    default:
      return { ...memory, [input.field]: fact };
  }
}

/** Fields with no recorded value yet (candidate questions are optional and not listed). */
export function missingFields(memory: CandidateMemory): FactField[] {
  const missing: FactField[] = [];
  if (!memory.experience_sector.length && !memory.experience_tasks.length) missing.push("experience_sector");
  if (!memory.availability) missing.push("availability");
  if (!memory.shift_preference) missing.push("shift_preference");
  if (!memory.salary_expectation) missing.push("salary_expectation");
  return missing;
}
