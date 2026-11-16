import { Type, type FunctionDeclaration } from "@google/genai";
import { FACT_FIELDS } from "@/lib/interview/memory";
import type { JobBrief } from "@/lib/job";

export const JOB_TOPICS = [
  "location", "salary", "hours", "tasks", "contract", "start_date", "experience", "agency", "other",
] as const;
export type JobTopic = (typeof JOB_TOPICS)[number];

export const interviewTools: FunctionDeclaration[] = [
  {
    name: "record_candidate_fact",
    description:
      "Enregistre une information que le candidat vient de dire, avec ses propres mots. N'enregistre jamais une supposition.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          enum: [...FACT_FIELDS],
          description:
            "name, experience_sector, experience_tasks, availability, shift_preference, salary_expectation ou candidate_question.",
        },
        raw: { type: Type.STRING, description: "Les mots du candidat, au plus proche de ce qu'il a dit." },
        normalized: {
          type: Type.STRING,
          description:
            "Optionnel. availability: 'immediate' ou une date AAAA-MM-JJ. shift_preference: un horaire de la fiche, 'les deux' ou 'aucun'. salary_expectation: un nombre en euros brut par heure. Laisser vide si incertain.",
        },
      },
      required: ["field", "raw"],
    },
  },
  {
    name: "answer_job_question",
    description:
      "Retourne les faits de la fiche de poste pour répondre à une question du candidat. Réponds uniquement avec ce qui est retourné.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, enum: [...JOB_TOPICS], description: "Sujet de la question." },
      },
      required: ["topic"],
    },
  },
  {
    name: "end_interview",
    description:
      "À appeler une fois, après avoir remercié le candidat et dit au revoir, quand l'entretien est terminé.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export const UNKNOWN_JOB_INFO =
  "Cette information n'est pas dans la fiche du poste. Dis que le recruteur répondra.";

/** Facts only, straight from the job sheet. */
export function answerJobQuestion(topic: JobTopic, job: JobBrief): string {
  const hours = job.working_hours.join(" ou ");
  switch (topic) {
    case "location":
      return `Le poste est à ${job.location}.`;
    case "salary":
      return `${job.salary_note}.`;
    case "hours":
      return `Deux créneaux possibles : ${hours}.`;
    case "tasks":
      return `${job.tasks}.`;
    case "contract":
      return `${job.contract}.`;
    case "start_date":
      return `La mission commence le ${job.start_date_fr}.`;
    case "experience":
      return `${job.experience}.`;
    case "agency":
      return `L'agence est ${job.agency}.`;
    default:
      return UNKNOWN_JOB_INFO;
  }
}
