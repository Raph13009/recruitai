import { describe, expect, it } from "vitest";
import {
  demoOpening, demoTurn, detectTopic, extractAvailability, extractFirstName, extractSalary, extractShift, normalizeText,
  type DemoStep,
} from "@/lib/interview/demo-engine";
import { applyFact, emptyMemory, type CandidateMemory } from "@/lib/interview/memory";
import { getDemoJobFacts, toJobBrief } from "@/lib/job";

const TODAY = "2026-11-17"; // a Tuesday
const job = toJobBrief(getDemoJobFacts(), TODAY); // starts Monday 23 November 2026
const HOURS = job.working_hours;

describe("text helpers", () => {
  it("normalizes accents, case and apostrophes", () => {
    expect(normalizeText("  Je suis DISPONIBLE à l’heure  ")).toBe("je suis disponible a l'heure");
  });

  it("finds a first name only when one is given", () => {
    expect(extractFirstName("Je m'appelle Léa Martin")).toBe("Léa");
    expect(extractFirstName("Oui, moi c'est karim")).toBe("Karim");
    expect(extractFirstName("Bonjour, je suis Ana")).toBe("Ana");
    expect(extractFirstName("Oui je suis prête")).toBeNull();
    expect(extractFirstName("Je suis disponible")).toBeNull();
  });

  it("maps a question to a job topic", () => {
    expect(detectTopic(normalizeText("C'est sur Paris ?"))).toBe("location");
    expect(detectTopic(normalizeText("C'est payé combien ?"))).toBe("salary");
    expect(detectTopic(normalizeText("Ça commence quand ?"))).toBe("start_date");
    expect(detectTopic(normalizeText("Il y a une cantine ?"))).toBe("other");
  });
});

describe("availability", () => {
  const at = (text: string) => extractAvailability(normalizeText(text), TODAY);

  it("understands immediate availability", () => {
    expect(at("Je suis disponible immédiatement")).toBe("immediate");
    expect(at("tout de suite")).toBe("immediate");
  });

  it("reads explicit dates, rolling to next year when the day has passed", () => {
    expect(at("À partir du 1er décembre")).toBe("2026-12-01");
    expect(at("le 3 mars")).toBe("2027-03-03");
    expect(at("le 30 novembre 2026")).toBe("2026-11-30");
  });

  it("reads relative dates", () => {
    expect(at("demain")).toBe("2026-11-18");
    expect(at("lundi prochain")).toBe("2026-11-23");
    expect(at("dans deux semaines")).toBe("2026-12-01");
    expect(at("le mois prochain")).toBe("2026-12-01");
  });

  it("refuses impossible or vague answers", () => {
    expect(at("le 31 février")).toBeNull();
    expect(at("je ne sais pas encore")).toBeNull();
  });
});

describe("shift", () => {
  const shift = (text: string, hours = HOURS) => extractShift(normalizeText(text), hours);

  it("picks a slot from common phrasings", () => {
    expect(shift("Le premier, celui du matin")).toBe(HOURS[0]);
    expect(shift("Plutôt l'après-midi")).toBe(HOURS[1]);
    expect(shift("à partir de 13 h")).toBe(HOURS[1]);
    expect(shift("les deux me vont")).toBe("les deux");
  });

  it("recognizes a refusal but not 'aucun problème'", () => {
    expect(shift("Aucun ne me convient")).toBe("aucun");
    expect(shift("aucun problème")).toBeNull();
  });

  it("handles a job with a single slot", () => {
    expect(shift("oui ça me va", ["8:00–16:00"])).toBe("8:00–16:00");
    expect(shift("non", ["8:00–16:00"])).toBe("aucun");
  });
});

describe("salary", () => {
  const salary = (text: string) => extractSalary(normalizeText(text), job.salary_gross_hourly_eur);

  it("reads figures and words", () => {
    expect(salary("Autour de 13 euros de l'heure")).toBe("13");
    expect(salary("12,50")).toBe("12.5");
    expect(salary("13 euros 50")).toBe("13.5");
    expect(salary("treize euros")).toBe("13");
    expect(salary("douze cinquante")).toBe("12.5");
  });

  it("accepts the sheet salary and rejects monthly amounts", () => {
    expect(salary("Ça me va")).toBe("12.5");
    expect(salary("Le salaire de la fiche me va")).toBe("12.5");
    expect(salary("1500 euros par mois")).toBeNull();
  });
});

describe("dialogue", () => {
  function run(answers: string[]) {
    let step: DemoStep = demoOpening(job, "Camille").next;
    let memory: CandidateMemory = emptyMemory();
    const said: string[] = [];
    let done = false;
    for (const text of answers) {
      const result = demoTurn({ step, text, job, persona: "Camille", memory, today: TODAY });
      for (const fact of result.facts) memory = applyFact(memory, fact, HOURS);
      said.push(result.say);
      step = result.next;
      done = result.done;
    }
    return { step, memory, said, done };
  }

  it("opens as an AI and never makes a decision", () => {
    const opening = demoOpening(job, "Camille").say;
    expect(opening).toContain("je suis Camille, une IA");
    expect(opening).toContain("Je ne prends aucune décision");
  });

  it("runs a full interview and records every fact", () => {
    const { memory, said, done, step } = run([
      "Oui, je m'appelle Léa",
      "J'ai travaillé en restauration, en salle",
      "Je suis disponible immédiatement",
      "Le premier, celui du matin",
      "Autour de 13 euros",
      "C'est où exactement ?",
      "Non merci, c'est tout",
    ]);
    expect(done).toBe(true);
    expect(step).toBe("done");
    expect(memory.name?.normalized).toBe("Léa");
    expect(memory.experience_sector[0]?.normalized).toBe("restauration");
    expect(memory.availability?.normalized).toBe("immediate");
    expect(memory.shift_preference?.normalized).toBe(HOURS[0]);
    expect(memory.salary_expectation?.normalized).toBe("13");
    expect(memory.candidate_question).toHaveLength(1);
    expect(said[5]).toContain("Le poste est à Lyon.");
    expect(said.at(-1)).toContain("Merci Léa");
    expect(said.join(" ")).not.toMatch(/retenu|refusé|score/i);
  });

  it("answers a question and asks again when nothing else was said", () => {
    const { step, memory, said } = run(["oui", "manutention", "C'est sur Paris ?"]);
    expect(said.at(-1)).toContain("Le poste est à Lyon.");
    expect(said.at(-1)).toContain("À partir de quand");
    expect(step).toBe("availability");
    expect(memory.availability).toBeNull();
  });

  it("handles a fact and a question in the same sentence", () => {
    const { step, memory, said } = run(["oui", "manutention", "Dispo à partir du 1er décembre, c'est sur Paris ?"]);
    expect(memory.availability?.normalized).toBe("2026-12-01");
    expect(said.at(-1)).toContain("Lyon");
    expect(said.at(-1)).toContain("La mission commence le 23 novembre 2026");
    expect(step).toBe("shift");
  });

  it("asks again when it heard nothing useful", () => {
    const { step, said } = run(["oui", "euh"]);
    expect(said.at(-1)).toContain("Je n'ai pas bien entendu");
    expect(step).toBe("experience");
  });

  it("keeps the candidate's words when it cannot normalize them", () => {
    const { memory } = run(["oui", "vente", "je verrai bien"]);
    expect(memory.availability).toEqual(expect.objectContaining({ raw: "je verrai bien", normalized: null }));
  });
});
