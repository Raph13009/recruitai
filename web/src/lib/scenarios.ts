import { z } from "zod";
import btp from "@/data/scenarios/btp-second-oeuvre.json";
import commerce from "@/data/scenarios/commerce-rayon.json";
import industrie from "@/data/scenarios/industrie-production.json";
import logistique from "@/data/scenarios/logistique-urgent.json";
import restauration from "@/data/scenarios/restauration-evenement.json";
import { formatFrDate, type JobFacts } from "@/lib/job";

const introductionSchema = z.object({
  job_title_spoken: z.string().min(1),
  first_question: z.string().min(1),
});

const scenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sector: z.string().min(1),
  agency: z.string().min(1),
  job_facts: z
    .object({
      position: z.string().min(1),
      city: z.string().min(1),
      contract: z.string().min(1),
      start_date: z.string().min(1),
      gross_hourly_salary_eur: z.number().positive(),
      hours: z.array(z.string().min(1)).min(1),
      duties: z.array(z.string().min(1)).min(1),
      experience: z.string().min(1),
    })
    .passthrough(),
  introduction: introductionSchema,
  fictional_demo: z.literal(true),
  language: z.string().default("fr-FR"),
}).passthrough();

export type DemoScenario = z.infer<typeof scenarioSchema>;

/** Stable demo job/config ids per scenario (same on every server). */
const SCENARIO_IDS: Record<string, { job: string; config: string }> = {
  "logistique-urgent": {
    job: "00000000-0000-4000-8000-000000000003",
    config: "00000000-0000-4000-8000-000000000004",
  },
  "industrie-production": {
    job: "00000000-0000-4000-8000-000000000013",
    config: "00000000-0000-4000-8000-000000000014",
  },
  "restauration-evenement": {
    job: "00000000-0000-4000-8000-000000000023",
    config: "00000000-0000-4000-8000-000000000024",
  },
  "btp-second-oeuvre": {
    job: "00000000-0000-4000-8000-000000000033",
    config: "00000000-0000-4000-8000-000000000034",
  },
  "commerce-rayon": {
    job: "00000000-0000-4000-8000-000000000043",
    config: "00000000-0000-4000-8000-000000000044",
  },
};

const RAW = [logistique, industrie, restauration, btp, commerce] as const;

export const DEMO_SCENARIOS: DemoScenario[] = RAW.map((raw) => scenarioSchema.parse(raw));

export const DEFAULT_SCENARIO_ID = "logistique-urgent";

export function getScenario(id: string | null | undefined): DemoScenario | undefined {
  if (!id) return undefined;
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

export function requireScenario(id: string | null | undefined): DemoScenario {
  return getScenario(id) ?? getScenario(DEFAULT_SCENARIO_ID)!;
}

export function scenarioResourceIds(scenarioId: string): { job: string; config: string } {
  const ids = SCENARIO_IDS[scenarioId] ?? SCENARIO_IDS[DEFAULT_SCENARIO_ID];
  return ids;
}

/** JobFacts stored on the session's job, including scenario metadata for the prompt. */
export function scenarioToJobFacts(scenario: DemoScenario): JobFacts & {
  scenario_id: string;
  first_question: string;
  job_title_spoken: string;
} {
  const salary = scenario.job_facts.gross_hourly_salary_eur;
  const salaryFr = salary.toFixed(2).replace(".", ",");
  return {
    agency: scenario.agency,
    job_title: scenario.job_facts.position,
    location: scenario.job_facts.city,
    contract: scenario.job_facts.contract,
    salary_gross_hourly_eur: salary,
    salary_note: `${salaryFr} € brut de l'heure`,
    working_hours: [...scenario.job_facts.hours],
    tasks: scenario.job_facts.duties.join(", "),
    experience: scenario.job_facts.experience,
    start_date_rule: scenario.job_facts.start_date,
    disclaimer: "Toutes les informations de ce poste sont fictives.",
    scenario_id: scenario.id,
    first_question: scenario.introduction.first_question,
    job_title_spoken: scenario.introduction.job_title_spoken,
  };
}

export function scenarioStartDateFr(scenario: DemoScenario): string {
  return formatFrDate(scenario.job_facts.start_date);
}

export function listScenarioCards() {
  return DEMO_SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    sector: s.sector,
    city: s.job_facts.city,
    position: s.job_facts.position,
    featured: ["logistique-urgent", "industrie-production", "restauration-evenement"].includes(s.id),
  }));
}
