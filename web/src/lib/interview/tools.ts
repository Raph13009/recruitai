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
      "Record a useful, appropriate work-related fact the candidate just stated, in their own words. Never record illegal, violent, sexual, abusive, or absurd statements.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          enum: [...FACT_FIELDS],
          description:
            "name, experience_sector, experience_tasks, availability, shift_preference, salary_expectation, or candidate_question.",
        },
        raw: { type: Type.STRING, description: "The candidate's words, as close as possible." },
        normalized: {
          type: Type.STRING,
          description:
            "Optional. availability: 'immediate' or a YYYY-MM-DD date. shift_preference: a shift from the sheet, 'both', or 'none'. salary_expectation: a number in euros gross per hour. Leave empty if unsure.",
        },
      },
      required: ["field", "raw"],
    },
  },
  {
    name: "answer_job_question",
    description:
      "Return facts from the job sheet to answer a candidate question. Reply only with what is returned.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, enum: [...JOB_TOPICS], description: "Topic of the question." },
      },
      required: ["topic"],
    },
  },
  {
    name: "end_interview",
    description:
      "Call once, after thanking the candidate and saying goodbye, when the interview is finished.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export const UNKNOWN_JOB_INFO =
  "This information is not on the job sheet. Say the recruiter will follow up.";

/** Facts only, straight from the job sheet. */
export function answerJobQuestion(topic: JobTopic, job: JobBrief): string {
  const hours = job.working_hours.join(" or ");
  switch (topic) {
    case "location":
      return `The role is in ${job.location}.`;
    case "salary":
      return `${job.salary_note}.`;
    case "hours":
      return `Two possible shifts: ${hours}.`;
    case "tasks":
      return `${job.tasks}.`;
    case "contract":
      return `${job.contract}.`;
    case "start_date":
      return `The assignment starts on ${job.start_date_fr}.`;
    case "experience":
      return `${job.experience}.`;
    case "agency":
      return `The agency is ${job.agency}.`;
    default:
      return UNKNOWN_JOB_INFO;
  }
}
