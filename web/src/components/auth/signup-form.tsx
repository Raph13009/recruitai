"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { signup } from "@/app/actions/auth";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, EMPTY_FORM);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="display text-3xl font-semibold">Créer un compte</h1>
          <p className="text-balance text-sm text-muted-foreground">
            Votre agence, un premier poste, et vos candidats passent l’entretien dans la journée.
          </p>
        </div>
        <Field data-invalid={Boolean(errors.agency)}>
          <FieldLabel htmlFor="agency">Nom de l’agence</FieldLabel>
          <Input
            id="agency"
            name="agency"
            autoComplete="organization"
            placeholder="Interim Lyon Sud"
            defaultValue={state.values?.agency}
            aria-invalid={Boolean(errors.agency)}
            required
          />
          {errors.agency && <FieldError>{errors.agency}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Votre nom</FieldLabel>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            defaultValue={state.values?.name}
            aria-invalid={Boolean(errors.name)}
            required
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail professionnel</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="vous@agence.fr"
            defaultValue={state.values?.email}
            aria-invalid={Boolean(errors.email)}
            required
          />
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            aria-invalid={Boolean(errors.password)}
            required
          />
          {errors.password ? (
            <FieldError>{errors.password}</FieldError>
          ) : (
            <FieldDescription>Au moins 8 caractères.</FieldDescription>
          )}
        </Field>
        {state.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Créer mon compte
          </Button>
        </Field>
        <FieldDescription className="text-center">
          Déjà un compte ? <Link href="/login">Se connecter</Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
