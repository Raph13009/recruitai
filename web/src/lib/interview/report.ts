import type { CandidateMemory, Fact } from "@/lib/interview/memory";
import { missingFields } from "@/lib/interview/memory";
import type { JobBrief } from "@/lib/job";

// Factual report only. No score, no ranking, no recommendation: those fields exist so it is explicit they are empty.

export interface ReportFact {
  raw: string;
  normalized: string | null;
}

export interface InterviewReport {
  version: 1;
  generated_at: string;
  session_id: string;
  candidate_label: string;
  is_synthetic: boolean;
  mode: "audio" | "avatar" | null;
  job: { agency: string; title: string; location: string; start_date: string; working_hours: string[]; salary_gross_hourly_eur: number };
  declared: {
    name: ReportFact | null;
    experience_sector: ReportFact[];
    experience_tasks: ReportFact[];
    availability: ReportFact | null;
    shift_preference: ReportFact | null;
    salary_expectation: ReportFact | null;
    candidate_questions: ReportFact[];
  };
  /** Neutral differences between what was declared and the job sheet, for the human reader. */
  points_to_review: string[];
  not_collected: string[];
  transcript_turns: number;
  scoring: null;
  ranking: null;
  hiring_recommendation: null;
  notice: string;
}

const toFact = (f: Fact): ReportFact => ({ raw: f.raw, normalized: f.normalized });

export function buildReport(input: {
  sessionId: string;
  candidateLabel: string;
  isSynthetic: boolean;
  mode: "audio" | "avatar" | null;
  job: JobBrief;
  memory: CandidateMemory;
  transcriptTurns: number;
  now?: Date;
}): InterviewReport {
  const { job, memory } = input;
  const points: string[] = [];

  const availability = memory.availability?.normalized;
  if (availability && availability !== "immediate" && availability > job.start_date) {
    points.push(`Disponibilité déclarée (${availability}) après le début de mission (${job.start_date}).`);
  }
  const salary = Number(memory.salary_expectation?.normalized);
  if (memory.salary_expectation?.normalized && salary !== job.salary_gross_hourly_eur) {
    points.push(
      `Attente salariale déclarée : ${salary} € brut/h. Salaire de la fiche : ${job.salary_gross_hourly_eur} € brut/h.`,
    );
  }
  if (memory.shift_preference?.normalized === "aucun") {
    points.push("Le candidat a déclaré qu'aucun des créneaux proposés ne lui convient.");
  }
  if (memory.candidate_question.length) {
    points.push("Le candidat a posé des questions : à relire.");
  }

  return {
    version: 1,
    generated_at: (input.now ?? new Date()).toISOString(),
    session_id: input.sessionId,
    candidate_label: input.candidateLabel,
    is_synthetic: input.isSynthetic,
    mode: input.mode,
    job: {
      agency: job.agency,
      title: job.job_title,
      location: job.location,
      start_date: job.start_date,
      working_hours: job.working_hours,
      salary_gross_hourly_eur: job.salary_gross_hourly_eur,
    },
    declared: {
      name: memory.name ? toFact(memory.name) : null,
      experience_sector: memory.experience_sector.map(toFact),
      experience_tasks: memory.experience_tasks.map(toFact),
      availability: memory.availability ? toFact(memory.availability) : null,
      shift_preference: memory.shift_preference ? toFact(memory.shift_preference) : null,
      salary_expectation: memory.salary_expectation ? toFact(memory.salary_expectation) : null,
      candidate_questions: memory.candidate_question.map(toFact),
    },
    points_to_review: points,
    not_collected: missingFields(memory),
    transcript_turns: input.transcriptTurns,
    scoring: null,
    ranking: null,
    hiring_recommendation: null,
    notice:
      "Compte rendu factuel généré à partir des déclarations du candidat. Aucun score, classement ou recommandation d'embauche : la décision revient à un recruteur humain.",
  };
}
