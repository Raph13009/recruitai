import { z } from "zod";
import demoJob from "@/data/demo_job.json";

export const jobFactsSchema = z.object({
  agency: z.string().min(1),
  job_title: z.string().min(1),
  location: z.string().min(1),
  contract: z.string().min(1),
  salary_gross_hourly_eur: z.number().positive(),
  salary_note: z.string().min(1),
  working_hours: z.array(z.string().min(1)).min(1),
  tasks: z.string().min(1),
  experience: z.string().min(1),
  start_date_rule: z.string().default("next_monday"),
  disclaimer: z.string().default(""),
  /** Demo scenario id when the job comes from recruitai-demo-scenarios. */
  scenario_id: z.string().optional(),
  first_question: z.string().optional(),
  job_title_spoken: z.string().optional(),
  /** interim (default) or short_leadership (executive / internal short interview). */
  interview_mode: z.enum(["interim", "short_leadership"]).optional(),
  /** Optional guide questions for short leadership demos (spoken topics, not a rigid script). */
  guide_questions: z.array(z.string().min(1)).optional(),
});

/** Raw job facts as stored (same shape as data/demo_job.json). */
export type JobFacts = z.infer<typeof jobFactsSchema>;

/** Job facts plus the computed start date. This is the only source the interviewer may answer from. */
export type JobBrief = JobFacts & { start_date: string; start_date_fr: string };

export function getDemoJobFacts(): JobFacts {
  return jobFactsSchema.parse(demoJob);
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Today's date (YYYY-MM-DD) in Paris, independent of the server timezone. */
export function todayInParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Next Monday strictly after today (if today is Monday, +7 days). Same rule as the Python POC. */
export function nextMonday(today: string = todayInParis()): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  const days = (7 - weekday) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatFrDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]} ${y}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `start_date_rule` is either a fixed date (YYYY-MM-DD) or "next_monday" (always the coming Monday). */
export function resolveStartDate(rule: string, today?: string): string {
  return isIsoDate(rule) ? rule : nextMonday(today);
}

export function toJobBrief(facts: JobFacts, today?: string): JobBrief {
  const start = resolveStartDate(facts.start_date_rule, today);
  return { ...facts, start_date: start, start_date_fr: formatFrDate(start) };
}

export function getDemoJobBrief(): JobBrief {
  return toJobBrief(getDemoJobFacts());
}
