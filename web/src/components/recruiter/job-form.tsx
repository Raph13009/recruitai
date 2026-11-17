"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { saveJob } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Job } from "@/lib/db/types";
import { isIsoDate } from "@/lib/job";

/** Form values as strings, from an existing job or from a submission that came back with errors. */
function initialValues(job?: Job): Record<string, string> {
  if (!job) {
    return {
      job_title: "", location: "", contract: "", salary: "", working_hours: "", tasks: "",
      experience: "Débutants acceptés", start_mode: "next_monday", start_date: "", status: "open", fictional: "",
    };
  }
  const f = job.facts;
  const fixed = isIsoDate(f.start_date_rule);
  return {
    job_title: f.job_title,
    location: f.location,
    contract: f.contract,
    salary: String(f.salary_gross_hourly_eur).replace(".", ","),
    working_hours: f.working_hours.join("\n"),
    tasks: f.tasks,
    experience: f.experience,
    start_mode: fixed ? "date" : "next_monday",
    start_date: fixed ? f.start_date_rule : "",
    status: job.status,
    fictional: f.disclaimer ? "on" : "",
  };
}

export function JobForm({ job }: { job?: Job }) {
  const [state, action, pending] = useActionState(saveJob, EMPTY_FORM);
  const values = state.values ?? initialValues(job);
  const errors = state.fieldErrors ?? {};
  const [startMode, setStartMode] = useState(values.start_mode || "next_monday");
  // Re-mount the fields when a submission returns, so they show what was sent.
  const formKey = JSON.stringify(state.values ?? job?.id ?? "new");

  const invalid = (name: string) => Boolean(errors[name]);

  return (
    <form action={action} key={formKey} className="space-y-6">
      {job && <input type="hidden" name="id" value={job.id} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Le poste</CardTitle>
          <CardDescription>
            L’intervieweur répond uniquement avec ces informations. Ce qui n’y figure pas, il dit que le recruteur répondra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={invalid("job_title")}>
                <FieldLabel htmlFor="job_title">Intitulé</FieldLabel>
                <Input id="job_title" name="job_title" defaultValue={values.job_title} placeholder="Agent de quai / manutentionnaire" aria-invalid={invalid("job_title")} required />
                {errors.job_title && <FieldError>{errors.job_title}</FieldError>}
              </Field>
              <Field data-invalid={invalid("location")}>
                <FieldLabel htmlFor="location">Lieu</FieldLabel>
                <Input id="location" name="location" defaultValue={values.location} placeholder="Lyon 7e" aria-invalid={invalid("location")} required />
                {errors.location && <FieldError>{errors.location}</FieldError>}
              </Field>
            </div>
            <Field data-invalid={invalid("contract")}>
              <FieldLabel htmlFor="contract">Contrat</FieldLabel>
              <Input id="contract" name="contract" defaultValue={values.contract} placeholder="Mission temporaire de 2 semaines, renouvelable" aria-invalid={invalid("contract")} required />
              {errors.contract && <FieldError>{errors.contract}</FieldError>}
            </Field>
            <Field data-invalid={invalid("tasks")}>
              <FieldLabel htmlFor="tasks">Tâches</FieldLabel>
              <Textarea id="tasks" name="tasks" defaultValue={values.tasks} rows={2} placeholder="Chargement, déchargement et tri de colis" aria-invalid={invalid("tasks")} required />
              {errors.tasks && <FieldError>{errors.tasks}</FieldError>}
            </Field>
            <Field data-invalid={invalid("experience")}>
              <FieldLabel htmlFor="experience">Expérience attendue</FieldLabel>
              <Input id="experience" name="experience" defaultValue={values.experience} aria-invalid={invalid("experience")} required />
              {errors.experience && <FieldError>{errors.experience}</FieldError>}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conditions</CardTitle>
          <CardDescription>Le salaire et les créneaux sont rappelés au candidat pendant l’entretien.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={invalid("salary")}>
                <FieldLabel htmlFor="salary">Salaire horaire brut (€)</FieldLabel>
                <Input id="salary" name="salary" inputMode="decimal" defaultValue={values.salary} placeholder="12,50" aria-invalid={invalid("salary")} required />
                {errors.salary && <FieldError>{errors.salary}</FieldError>}
              </Field>
              <Field data-invalid={invalid("working_hours")}>
                <FieldLabel htmlFor="working_hours">Créneaux horaires</FieldLabel>
                <Textarea id="working_hours" name="working_hours" defaultValue={values.working_hours} rows={2} placeholder={"6:00–13:00\n13:00–20:00"} aria-invalid={invalid("working_hours")} required />
                {errors.working_hours ? <FieldError>{errors.working_hours}</FieldError> : <FieldDescription>Un créneau par ligne, quatre au plus.</FieldDescription>}
              </Field>
            </div>

            <FieldSet>
              <FieldLegend variant="label">Date de début</FieldLegend>
              <input type="hidden" name="start_mode" value={startMode} />
              <RadioGroup value={startMode} onValueChange={setStartMode} className="gap-3">
                <Field orientation="horizontal">
                  <RadioGroupItem value="next_monday" id="start-next-monday" />
                  <FieldContent>
                    <FieldLabel htmlFor="start-next-monday" className="font-normal">Le lundi qui suit l’entretien</FieldLabel>
                    <FieldDescription>Toujours à jour, pratique pour un poste ouvert en continu.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="date" id="start-date-mode" />
                  <FieldLabel htmlFor="start-date-mode" className="font-normal">Une date précise</FieldLabel>
                </Field>
              </RadioGroup>
              {startMode === "date" && (
                <Field data-invalid={invalid("start")} className="max-w-xs">
                  <Input type="date" name="start_date" defaultValue={values.start_date} aria-label="Date de début" aria-invalid={invalid("start")} required />
                  {errors.start && <FieldError>{errors.start}</FieldError>}
                </Field>
              )}
            </FieldSet>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="status">Statut</FieldLabel>
                <NativeSelect id="status" name="status" defaultValue={values.status} className="w-full">
                  <NativeSelectOption value="open">Ouvert : accepte de nouveaux entretiens</NativeSelectOption>
                  <NativeSelectOption value="draft">Brouillon</NativeSelectOption>
                  <NativeSelectOption value="closed">Fermé</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field orientation="horizontal" className="self-end">
                <Checkbox id="fictional" name="fictional" defaultChecked={values.fictional === "on"} />
                <FieldContent>
                  <FieldLabel htmlFor="fictional" className="font-normal">Poste fictif</FieldLabel>
                  <FieldDescription>Pour vos essais : l’IA le signale au candidat.</FieldDescription>
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {job ? "Enregistrer" : "Créer le poste"}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href={job ? `/recruiter/jobs/${job.id}` : "/recruiter/jobs"}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}
