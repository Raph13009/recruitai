"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { acceptInvite } from "@/app/actions/auth";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AcceptInviteForm({
  token,
  email,
  agencyName,
}: {
  token: string;
  email: string;
  agencyName: string;
}) {
  const [state, action, pending] = useActionState(acceptInvite, EMPTY_FORM);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="display text-3xl font-semibold">Rejoindre l’agence</h1>
          <p className="text-balance text-sm text-muted-foreground">
            Créez votre compte pour accéder aux postes et entretiens de{" "}
            <strong>{agencyName}</strong>.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" value={email} readOnly disabled />
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
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            required
            minLength={8}
          />
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>
        {state.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Créer mon compte
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Se connecter
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
