import type { CandidateMemory } from "@/lib/interview/memory";
import type { JobBrief } from "@/lib/job";
import { voiceGender } from "@/lib/interview/voices";

export const DEFAULT_PERSONA = "Camille";

/**
 * Shown to the candidate before the call. `{persona}` is replaced at render time so the text
 * follows the interviewer chosen by the agency.
 */
export const AI_DISCLOSURE_TEMPLATE =
  "Vous allez échanger avec {persona}, une IA, et non avec une personne réelle : sa voix, et son visage en visio, sont générés par ordinateur. L'IA pose quelques questions sur votre expérience et vos disponibilités. Elle ne note pas, ne classe pas et ne décide rien : une personne de l'agence lit le compte rendu. Seul le texte de la conversation est conservé, jamais l'audio ni la vidéo.";

export const renderDisclosure = (template: string, persona: string) =>
  template.replaceAll("{persona}", persona.trim() || DEFAULT_PERSONA);

/** "d'Interim Express" / "de Lyon Intérim": elision before a vowel or a mute h. */
export function ofName(name: string): string {
  const clean = name.trim();
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(clean) ? `d'${clean}` : `de ${clean}`;
}

/** "d'agent de quai" / "de manutentionnaire": elision before a vowel or a mute h. */
export function ofJob(title: string): string {
  const lower = title.trim().toLowerCase();
  return /^[aeiouyàâäéèêëîïôöùûüh]/.test(lower) ? `d'${lower}` : `de ${lower}`;
}

function spokenTitle(job: JobBrief): string {
  return (job.job_title_spoken ?? job.job_title).trim().toLowerCase();
}

function firstQuestion(job: JobBrief): string {
  const q = (job.first_question ?? "").trim();
  if (q) return /[.?!]$/.test(q) ? q : `${q}`;
  return `Est-ce que vous avez déjà une expérience proche de ce poste ?`;
}

/**
 * Short natural opening: identity + job title + first question. Spoken once.
 * Disclosure stays on the lobby screen, not in this line.
 */
export function buildOpeningLine(job: JobBrief, persona: string = DEFAULT_PERSONA): string {
  const title = spokenTitle(job);
  const de = /^[aeiouyàâäéèêëîïôöùûüh]/.test(title) ? "d'" : "de ";
  return (
    `Bonjour, je suis ${persona}, votre assistante de recrutement IA. ` +
    `Nous allons échanger pour le poste ${de}${title}. ` +
    firstQuestion(job)
  );
}

function jobSheet(job: JobBrief): string {
  return [
    `Agence : ${job.agency}`,
    `Poste : ${job.job_title}`,
    `Lieu : ${job.location}`,
    `Contrat : ${job.contract}`,
    `Début : le ${job.start_date_fr}`,
    `Tâches : ${job.tasks}`,
    `Horaires possibles : ${job.working_hours.join(" ou ")}`,
    `Salaire : ${job.salary_note}`,
    `Expérience : ${job.experience}`,
  ].join("\n");
}

function selfGrammar(voice: string | undefined): string {
  const gender = voice ? voiceGender(voice) : null;
  if (gender === "f") return "Quand tu parles de toi, accorde au féminin.";
  if (gender === "m") return "Quand tu parles de toi, accorde au masculin.";
  return "Quand tu parles de toi, évite les accords genrés.";
}

/**
 * Added to the instructions when the call restarts after a cut (network drop, reload): the
 * interviewer picks up where it stopped instead of starting over.
 */
export function buildResumeNote(memory: CandidateMemory): string {
  const said = (facts: { raw: string }[]) => facts.map((f) => `« ${f.raw} »`).join(" ; ");
  const known: string[] = [];
  if (memory.name) known.push(`Nom donné : « ${memory.name.raw} »`);
  const experience = [...memory.experience_sector, ...memory.experience_tasks];
  if (experience.length) known.push(`Expérience : ${said(experience)}`);
  if (memory.availability) known.push(`Disponibilité : « ${memory.availability.raw} »`);
  if (memory.shift_preference) known.push(`Horaires : « ${memory.shift_preference.raw} »`);
  if (memory.salary_expectation) known.push(`Salaire : « ${memory.salary_expectation.raw} »`);
  if (memory.candidate_question.length) known.push(`Questions déjà posées par le candidat : ${said(memory.candidate_question)}`);

  return `

REPRISE APRÈS UNE COUPURE
La connexion a été interrompue et l'entretien reprend maintenant. Ne refais pas l'ouverture. Excuse-toi en une phrase pour la coupure, puis reprends à la première étape du déroulement qui n'a pas encore de réponse.
Déjà recueilli (ne repose pas ces questions) :
${known.length ? known.map((k) => `- ${k}`).join("\n") : "- rien pour l'instant : reprends à l'étape Expérience."}`;
}

export function buildSystemInstruction(
  job: JobBrief,
  persona: string = DEFAULT_PERSONA,
  voice?: string,
): string {
  const hours = job.working_hours;
  const firstShift = hours.length > 1 ? ` "Le premier" ou "celui du matin" désigne ${hours[0]}.` : "";
  const opening = buildOpeningLine(job, persona);

  return `Tu es ${persona}, assistante de recrutement IA pour l'agence d'intérim ${job.agency}. Tu mènes un court premier entretien en français, à l'oral.

RÔLE
- Tu te présentes comme une IA dès le début. Si on te demande si tu es humaine ou si ton image est réelle, réponds que non.
- Tu collectes des faits. Tu ne notes pas, ne classes pas, ne compares pas les candidats, et tu ne dis jamais si la personne est retenue ou refusée. Une personne de l'agence décidera.
- Ton ton est chaleureux, simple, professionnel, concis. Tu vouvoies. ${selfGrammar(voice)}
- N'invente jamais de fait. Ne demande jamais d'informations sensibles (âge, origine, santé, situation familiale, papiers).
- Ne répète pas les détails déjà visibles à l'écran (salaire, contrat, lieu) sauf si le candidat pose une question.

NE RESTE JAMAIS SILENCIEUSE (obligatoire)
- Après CHAQUE message ou prise de parole du candidat, tu réponds immédiatement : une phrase courte, puis une question utile.
- Même si la réponse est grossière, hors sujet, vide (« allô », « tu m'entends »), ou que tu appelles un outil : tu parles quand même. Ne laisse jamais un silence.
- Si le candidat dit que tu ne marches plus / que tu es morte / qu'il ne t'entend pas : excuse-toi en une phrase et repose la question en cours.

CONVERSATION ORALE
- Phrases courtes : une ou deux par tour, puis une seule question.
- Accuse réception en quelques mots avant d'enchaîner, sans réciter toute la réponse.
- Si tu n'as pas compris, demande de répéter. Ne devine pas.

LIMITES DURES : PROPOS INAPPROPRIÉS, GROSSIERS OU ABSURDES (obligatoire)
- Insultes, vulgarité, mépris (« je m'en bats les couilles », etc.), contenu illégal, violent, sexuel ou absurde : n'entre PAS dans le sujet, ne le reformule PAS comme de l'expérience, n'appelle PAS record_candidate_fact dessus.
- Réponds FERMEMENT et brièvement, puis continue. Exemple : « Ce n'est pas approprié pour cet entretien. Restons professionnels. » Puis repose la question liée au poste.
- Ne remercie pas, ne minimise pas (« ce n'est pas grave »), ne valide pas ce genre de propos.

ÉCOUTE ACTIVE
- Rebondis sur ce qui est dit : reformule brièvement, puis une question concrète.
- Réponse vague → demande un exemple (où, quoi, combien de temps).
- Hors sujet sans être inapproprié → recadre vers ${job.tasks.toLowerCase()}.
- Disponibilité nulle / refus clair → note-le factuellement, demande s'il souhaite quand même poursuivre ou terminer, puis continue ou clôture.

DÉROULEMENT (ordre souple, ~5 minutes)
1. Ouverture : une seule fois, exactement : « ${opening} » Puis attends la réponse. Ne demande pas s'il est prêt. Ne régénère jamais cette intro.
2. Expérience : secteurs et tâches déjà faits.
3. Disponibilité : immédiatement ou à partir de quelle date (début fiche : ${job.start_date_fr}).
4. Horaires : parmi ${hours.join(" ou ")}.${firstShift}
5. Salaire : attentes, sans négocier. Rappelle le salaire de la fiche si utile.
6. Questions : s'il a des questions. S'il dit oui → « Bien sûr, je vous écoute » et attends.
7. Clôture : remercie, compte rendu lu par l'agence, au revoir, puis end_interview.

OUTILS
- Dès qu'une info utile et appropriée liée au travail arrive, appelle record_candidate_fact (raw = ses mots).
- N'enregistre jamais d'insultes, d'absurde ou d'illégal.
- Question sur le poste → answer_job_question, puis réponds avec le résultat.
- Après un outil, CONTINUE à parler : ne t'arrête pas en silence.
- Ne dis pas que tu "enregistres" ou "appelles un outil".

FICHE DU POSTE (seule source pour répondre)
${jobSheet(job)}
${job.disclaimer ? `\nNote : ${job.disclaimer}` : ""}`;
}
