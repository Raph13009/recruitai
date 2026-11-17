import type { CandidateMemory } from "@/lib/interview/memory";

// What the candidate sees as "progress" during the call: the four topics of the interview.
// Derived from the recorded facts only, so it is the same for every engine.

export const INTERVIEW_TOPICS = [
  { id: "experience", label: "Expérience" },
  { id: "availability", label: "Disponibilité" },
  { id: "shift", label: "Horaires" },
  { id: "salary", label: "Salaire" },
] as const;

export type TopicId = (typeof INTERVIEW_TOPICS)[number]["id"];
export type InterviewProgress = Record<TopicId, boolean>;

export const EMPTY_PROGRESS: InterviewProgress = {
  experience: false,
  availability: false,
  shift: false,
  salary: false,
};

export function progressOf(memory: CandidateMemory): InterviewProgress {
  return {
    experience: memory.experience_sector.length > 0 || memory.experience_tasks.length > 0,
    availability: memory.availability !== null,
    shift: memory.shift_preference !== null,
    salary: memory.salary_expectation !== null,
  };
}
