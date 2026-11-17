// Scripted interviewer used when no voice model is configured (no GEMINI_API_KEY).
// Deterministic and rule-based: it follows the same outline as the real interviewer, records the
// same typed facts and answers only from the job sheet. It is a demo, not a language model:
// it understands common phrasings and otherwise keeps the candidate's own words.
import { buildOpeningLine } from "@/lib/interview/prompt";
import type { CandidateMemory, FactInput } from "@/lib/interview/memory";
import { answerJobQuestion, type JobTopic } from "@/lib/interview/tools";
import { formatFrDate, todayInParis, type JobBrief } from "@/lib/job";

export const DEMO_STEPS = ["intro", "experience", "availability", "shift", "salary", "questions", "done"] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export interface DemoTurnResult {
  /** What the interviewer says next. */
  say: string;
  next: DemoStep;
  /** Facts to record, in the candidate's own words. */
  facts: FactInput[];
  done: boolean;
}

export interface DemoTurnInput {
  step: DemoStep;
  text: string;
  job: JobBrief;
  persona: string;
  memory: CandidateMemory;
  /** Paris date (YYYY-MM-DD). Injected in tests. */
  today?: string;
}

const MAX_CANDIDATE_QUESTIONS = 4;

// ---------- text helpers ----------

/** Lowercase, no accents, straight apostrophes, single spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

const NOT_A_NAME = new Set([
  "pret", "prete", "disponible", "la", "ok", "d'accord", "partant", "partante", "content", "contente",
  "desole", "desolee", "interesse", "interessee", "motive", "motivee", "en", "un", "une", "le", "tres",
]);

/** "Je m'appelle Léa Martin" -> "Léa". Never treats "je suis prêt" as a name. */
export function extractFirstName(text: string): string | null {
  const clean = text.replace(/[’`]/g, "'");
  const explicit = clean.match(/(?:je m'appelle|moi c'est|mon nom est|mon pr[ée]nom est|mon pr[ée]nom c'est)\s+(\p{L}[\p{L}-]*)/iu);
  const loose = clean.match(/(?:^|[\s,.])je suis\s+(\p{Lu}[\p{L}-]*)/u);
  const candidate = explicit?.[1] ?? loose?.[1];
  if (!candidate || NOT_A_NAME.has(normalizeText(candidate))) return null;
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

// ---------- job questions ----------

const QUESTION_MARKERS =
  /\?|(^|[\s,.])(est-ce qu|c'est (quoi|ou|combien|quand|sur|a|dans|pour)|quel(le)?s? |ou (est|se|ca)|combien|quand (est|commence|debute)|comment |pourquoi |y a-t-il|vous pouvez me dire|pouvez-vous|j'aimerais savoir|je voudrais savoir|je peux savoir|je me demandais)/;

const TOPIC_RULES: [JobTopic, RegExp][] = [
  ["contract", /contrat|duree|combien de temps|renouvel|\bcdi\b|\bcdd\b|temporaire/],
  ["start_date", /commence|debut|demarre|quel jour|quelle date/],
  ["salary", /salaire|paye|paie|remuner|combien|taux horaire|\bbrut\b|\bnet\b|gagne/],
  ["hours", /horaire|heure|creneau|planning/],
  ["location", /\bou\b|lieu|adresse|ville|quartier|sur paris|a paris|a lyon|sur lyon|se situe|localis/],
  ["tasks", /tache|consiste|faire quoi|quoi faire|missions?\b|le travail|le poste c'est/],
  ["experience", /experience|debutant|qualification/],
  ["agency", /agence|employeur|entreprise|societe/],
];

export function detectTopic(normalized: string): JobTopic {
  for (const [topic, rule] of TOPIC_RULES) if (rule.test(normalized)) return topic;
  return "other";
}

const isQuestion = (normalized: string) => QUESTION_MARKERS.test(normalized);

// ---------- extraction per step ----------

const SECTORS: [string, RegExp][] = [
  ["logistique", /logisti|entrepot|manutention|cariste|preparat(eur|rice|ion) de commande|\bquai\b|colis|magasinier|livr(aison|eur|euse)/],
  ["restauration", /restauration|restaurant|serveu(r|se)|cuisine|plonge|fast.?food|\bbar\b|en salle/],
  ["vente", /\bvente\b|vendeu(r|se)|caiss(e|ier|iere)|magasin|commerce|supermarche|mise en rayon|grande distribution/],
  ["bâtiment", /batiment|chantier|macon|peintre|\bbtp\b/],
  ["nettoyage", /nettoyage|menage|agent d'entretien/],
  ["industrie", /usine|industrie|production|operat(eur|rice)/],
];
const TASK_WORDS = /chargement|dechargement|\btri\b|trier|preparation de commande|port de charge|caisse|service|mise en rayon|inventaire|emballage|conditionnement|palette/;
const NO_EXPERIENCE = /aucune experience|pas d'experience|jamais travaille|premiere experience|premier emploi|je debute/;

function extractExperience(text: string, n: string) {
  const facts: FactInput[] = [];
  const sector = NO_EXPERIENCE.test(n) ? "aucune" : (SECTORS.find(([, rule]) => rule.test(n))?.[0] ?? null);
  facts.push({ field: "experience_sector", raw: text, normalized: sector });
  if (TASK_WORDS.test(n)) facts.push({ field: "experience_tasks", raw: text });
  return { facts, matched: sector !== null || TASK_WORDS.test(n) };
}

const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const SMALL_NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (isoDate: string, days: number) => {
  const d = utc(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};

/** "immediate", an ISO date, or null when the wording is not certain enough. */
export function extractAvailability(n: string, today: string): string | null {
  if (/immediat|tout de suite|des maintenant|\bmaintenant\b|de suite|des aujourd'hui|\baujourd'hui\b|quand vous voulez|des que possible/.test(n)) {
    return "immediate";
  }
  if (/\bdemain\b/.test(n) && !/apres.demain/.test(n)) return addDays(today, 1);

  const dated = n.match(new RegExp(`(\\d{1,2}|1er|premier)\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4}))?`));
  if (dated) {
    const day = /^\d/.test(dated[1]) ? parseInt(dated[1], 10) : 1;
    const month = MONTHS.indexOf(dated[2]);
    const base = utc(today);
    let year = dated[3] ? Number(dated[3]) : base.getUTCFullYear();
    let date = new Date(Date.UTC(year, month, day));
    if (!dated[3] && date < base) date = new Date(Date.UTC(++year, month, day));
    // Reject impossible days such as "31 février".
    return date.getUTCMonth() === month && date.getUTCDate() === day ? iso(date) : null;
  }

  const startOfMonth = n.match(new RegExp(`debut (${MONTHS.join("|")})`));
  if (startOfMonth) {
    const month = MONTHS.indexOf(startOfMonth[1]);
    const base = utc(today);
    const year = month < base.getUTCMonth() ? base.getUTCFullYear() + 1 : base.getUTCFullYear();
    return iso(new Date(Date.UTC(year, month, 1)));
  }

  const weekday = (utc(today).getUTCDay() + 6) % 7; // Monday = 0
  if (/lundi prochain|la semaine prochaine|semaine pro\b/.test(n)) return addDays(today, 7 - weekday);
  if (/le mois prochain/.test(n)) {
    const base = utc(today);
    return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1)));
  }
  const inWeeks = n.match(/dans (\d+|un|une|deux|trois|quatre|cinq|six) semaines?/);
  if (inWeeks) return addDays(today, 7 * (SMALL_NUMBERS[inWeeks[1]] ?? Number(inWeeks[1])));
  const inDays = n.match(/dans (\d+|un|deux|trois|quatre|cinq|six) jours?/);
  if (inDays) return addDays(today, SMALL_NUMBERS[inDays[1]] ?? Number(inDays[1]));
  return null;
}

/** One of the job's slots, "les deux", "aucun", or null. */
export function extractShift(n: string, hours: string[]): string | null {
  if (hours.length > 1 && /les deux|les 2|peu importe|n'importe|indifferent|l'un ou l'autre|flexible|tous les creneaux|ca m'est egal/.test(n)) {
    return "les deux";
  }
  if (/\baucune?\b(?! (probleme|souci))|ni l'un ni l'autre|ne me convien(nen)?t pas|pas possible|impossible/.test(n)) return "aucun";

  // A slot named by its start hour ("13 h", "13:00", "à partir de 6 heures").
  for (const slot of hours) {
    const start = slot.match(/^(\d{1,2})/)?.[1];
    if (start && new RegExp(`\\b${start}\\s?(h|:|heures?)`).test(n)) return slot;
  }
  if (/premier|\b1er\b|matin|\btot\b/.test(n)) return hours[0];
  if (hours.length > 1 && /dernier|soir|nuit/.test(n)) return hours[hours.length - 1];
  if (hours.length > 1 && /deuxieme|second|\b2e\b|apres.?midi|aprem/.test(n)) return hours[1];
  if (hours.length === 1 && /^(oui|ca me va|d'accord|ok|parfait|tres bien|ca me convient|pas de (probleme|souci))/.test(n)) return hours[0];
  if (hours.length === 1 && /^non\b/.test(n)) return "aucun";
  return null;
}

const UNITS: Record<string, number> = {
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  "dix-sept": 17, "dix-huit": 18, "dix-neuf": 19, vingt: 20,
};
const CENTS: Record<string, number> = { dix: 10, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

/** Hourly expectation in euros as a string ("13", "12.5"), or null. */
export function extractSalary(n: string, sheetSalary: number): string | null {
  const plausible = (value: number) => (value >= 5 && value <= 200 ? String(value) : null);

  const split = n.match(/(\d{1,3})\s*(?:€|euros?)\s*(\d{2})\b/);
  if (split) return plausible(Number(`${split[1]}.${split[2]}`));
  const digits = n.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|euros?|balles|de l'heure|brut|net|\b)/);
  if (digits) return plausible(Number(digits[1].replace(",", ".")));

  const words = n.match(new RegExp(`\\b(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|")})\\b(?:\\s+euros?)?(?:\\s+(${Object.keys(CENTS).join("|")})\\b)?`));
  if (words) return plausible(UNITS[words[1]] + (words[2] ? CENTS[words[2]] / 100 : 0));

  if (/\bme va\b|me convient|d'accord|\bok\b|parfait|tres bien|c'est bon|pas de (probleme|souci)|ca ira/.test(n)) {
    return String(sheetSalary);
  }
  return null;
}

// ---------- the dialogue ----------

function ask(step: DemoStep, job: JobBrief): string {
  const hours = job.working_hours;
  switch (step) {
    case "intro":
      return "Dites-moi quand on peut commencer.";
    case "experience":
      return "Pour commencer, quelle expérience avez-vous déjà ? Dans quel secteur avez-vous travaillé ?";
    case "availability":
      return "À partir de quand êtes-vous disponible ?";
    case "shift":
      return hours.length === 1
        ? `L'horaire du poste est ${hours[0]}. Est-ce que cela vous convient ?`
        : `Pour les horaires, les créneaux possibles sont ${hours.join(" ou ")}. Lequel vous convient ?`;
    case "salary":
      return `Le salaire indiqué est de ${eur(job.salary_gross_hourly_eur)} brut de l'heure. Quelles sont vos attentes ?`;
    case "questions":
      return "Avez-vous des questions sur le poste ?";
    default:
      return "";
  }
}

function closing(job: JobBrief, memory: CandidateMemory): string {
  const name = memory.name?.normalized ? ` ${memory.name.normalized}` : "";
  return `Merci${name}. Une personne de l'agence ${job.agency} lira le compte rendu et reviendra vers vous. Je ne prends aucune décision. Au revoir, et bonne journée.`;
}

export function demoOpening(job: JobBrief, persona: string): DemoTurnResult {
  return { say: buildOpeningLine(job, persona), next: "intro", facts: [], done: false };
}

export function demoTurn(input: DemoTurnInput): DemoTurnResult {
  const { step, job, memory } = input;
  const text = input.text.trim().slice(0, 500);
  const n = normalizeText(text);
  const today = input.today ?? todayInParis();

  if (step === "done") return { say: closing(job, memory), next: "done", facts: [], done: true };
  if (n.replace(/[^a-z0-9]/g, "").length < 2 || /^(euh+|hum+|hein|quoi|pardon)$/.test(n)) {
    return { say: `Je n'ai pas bien entendu. ${ask(step, job)}`, next: step, facts: [], done: false };
  }

  // The last step is the candidate's own questions.
  if (step === "questions") {
    const noMore = /^(non|nan|rien|aucune|c'est bon|c'est tout|ca ira|tout est clair|pas de question)\b|pas (de|d'autres?) questions?|aucune (autre )?question|tout est clair|c'est tout bon/.test(n);
    if (noMore && !/\?/.test(n)) return { say: closing(job, memory), next: "done", facts: [], done: true };
    const answer = answerJobQuestion(detectTopic(n), job);
    const facts: FactInput[] = [{ field: "candidate_question", raw: text }];
    if (memory.candidate_question.length + 1 >= MAX_CANDIDATE_QUESTIONS) {
      return { say: `${spoken(answer)} ${closing(job, memory)}`, next: "done", facts, done: true };
    }
    return { say: `${spoken(answer)} Avez-vous une autre question ?`, next: "questions", facts, done: false };
  }

  const facts: FactInput[] = [];
  const question = isQuestion(n) ? detectTopic(n) : null;
  const answer = question ? `${spoken(answerJobQuestion(question, job))} ` : "";
  if (question) facts.push({ field: "candidate_question", raw: text });

  let matched = false;
  let ack = "";
  let next: DemoStep = step;

  switch (step) {
    case "intro": {
      if (/^(non|nan|attendez|pas encore|une minute|un instant|deux secondes)\b/.test(n)) {
        return { say: "Prenez votre temps. Dites-moi quand on peut commencer.", next: "intro", facts, done: false };
      }
      const firstName = extractFirstName(text);
      if (firstName) facts.push({ field: "name", raw: text, normalized: firstName });
      matched = !question || firstName !== null || /\b(oui|pret|prete|ok|d'accord|allons-y|on y va|c'est parti|bien sur|vas-y|allez-y)\b/.test(n);
      ack = firstName ? `Merci ${firstName}.` : "Très bien.";
      next = "experience";
      break;
    }
    case "experience": {
      const found = extractExperience(text, n);
      matched = found.matched || !question;
      if (matched) facts.push(...found.facts);
      ack = "D'accord, merci.";
      next = "availability";
      break;
    }
    case "availability": {
      const when = extractAvailability(n, today);
      matched = when !== null || !question;
      if (matched) facts.push({ field: "availability", raw: text, normalized: when });
      ack =
        when && when !== "immediate" && when > job.start_date
          ? `C'est noté. La mission commence le ${job.start_date_fr} : j'indique que vous seriez disponible à partir du ${formatFrDate(when)}.`
          : "C'est noté.";
      next = "shift";
      break;
    }
    case "shift": {
      const slot = extractShift(n, job.working_hours);
      matched = slot !== null || !question;
      if (matched) facts.push({ field: "shift_preference", raw: text, normalized: slot });
      ack = slot === "aucun" ? "D'accord, je le note." : "Très bien.";
      next = "salary";
      break;
    }
    case "salary": {
      const amount = extractSalary(n, job.salary_gross_hourly_eur);
      matched = amount !== null || !question;
      if (matched) facts.push({ field: "salary_expectation", raw: text, normalized: amount });
      ack = "Merci, c'est noté.";
      next = "questions";
      break;
    }
  }

  // A question with nothing else in it: answer, then ask the same thing again.
  if (!matched) return { say: `${answer}${ask(step, job)}`, next: step, facts, done: false };
  return { say: `${answer}${ack} ${ask(next, job)}`.trim(), next, facts, done: false };
}

/** Tool results are written for the model ("Dis que le recruteur répondra"): turn them into speech. */
function spoken(toolResult: string): string {
  return toolResult.replace(
    /Cette information n'est pas dans la fiche du poste\. Dis que le recruteur répondra\./,
    "Cette information n'est pas dans la fiche du poste. Le recruteur pourra vous répondre.",
  );
}
