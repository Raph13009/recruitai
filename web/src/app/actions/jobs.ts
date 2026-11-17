"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { text, type FormState } from "@/app/actions/form-state";
import { requireRecruiter } from "@/lib/auth/dal";
import { setJobStatus, upsertJob } from "@/lib/db";
import { formatEur } from "@/lib/format";
import { isIsoDate, jobFactsSchema } from "@/lib/job";

const formSchema = z.object({
  job_title: z.string().min(2, "Donnez un intitulé au poste.").max(120),
  location: z.string().min(2, "Indiquez le lieu de travail.").max(120),
  contract: z.string().min(2, "Décrivez le contrat (durée, type).").max(200),
  salary: z
    .string()
    .transform((v) => Number(v.replace(",", ".").replace(/[^\d.]/g, "")))
    .refine((n) => Number.isFinite(n) && n > 0 && n < 1000, "Indiquez un salaire horaire brut, par exemple 12,50."),
  working_hours: z
    .string()
    .transform((v) => v.split(/\n|;/).map((slot) => slot.trim()).filter(Boolean))
    .refine((slots) => slots.length >= 1 && slots.length <= 4, "Indiquez de 1 à 4 créneaux, un par ligne."),
  tasks: z.string().min(2, "Décrivez les tâches en une phrase.").max(400),
  experience: z.string().min(2, "Indiquez l'expérience attendue (ou « Débutants acceptés »).").max(200),
  start: z.string().refine((v) => v === "next_monday" || isIsoDate(v), "Choisissez une date de début."),
  status: z.enum(["draft", "open", "closed"]),
  fictional: z.boolean(),
});

/** Creates or updates a job. The interviewer only ever answers from this sheet. */
export async function saveJob(_previous: FormState, formData: FormData): Promise<FormState> {
  const recruiter = await requireRecruiter();
  const id = text(formData, "id") || undefined;
  const startMode = text(formData, "start_mode");
  const values = {
    job_title: text(formData, "job_title"),
    location: text(formData, "location"),
    contract: text(formData, "contract"),
    salary: text(formData, "salary"),
    working_hours: String(formData.get("working_hours") ?? "").trim(),
    tasks: text(formData, "tasks"),
    experience: text(formData, "experience"),
    start_mode: startMode,
    start_date: text(formData, "start_date"),
    status: text(formData, "status") || "open",
    fictional: formData.get("fictional") ? "on" : "",
  };

  const parsed = formSchema.safeParse({
    ...values,
    start: startMode === "date" ? values.start_date : "next_monday",
    fictional: values.fictional === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values, error: "Certains champs sont à corriger." };
  }

  const data = parsed.data;
  const facts = jobFactsSchema.parse({
    agency: recruiter.agency.name,
    job_title: data.job_title,
    location: data.location,
    contract: data.contract,
    salary_gross_hourly_eur: data.salary,
    salary_note: `${formatEur(data.salary)} brut de l'heure, hors éventuelles indemnités légales applicables`,
    working_hours: data.working_hours,
    tasks: data.tasks,
    experience: data.experience,
    start_date_rule: data.start,
    disclaimer: data.fictional ? "Toutes les informations de ce poste sont fictives." : "",
  });

  const job = await upsertJob(recruiter.agency.id, { id, facts, status: data.status });
  if (!job) return { error: "Ce poste est introuvable.", values };
  redirect(`/recruiter/jobs/${job.id}`);
}

/** Opens or closes a job. A closed job no longer accepts new interview links. */
export async function changeJobStatus(formData: FormData): Promise<void> {
  const recruiter = await requireRecruiter();
  const status = z.enum(["draft", "open", "closed"]).safeParse(text(formData, "status"));
  if (!status.success) return;
  await setJobStatus(recruiter.agency.id, text(formData, "id"), status.data);
  refresh();
}
