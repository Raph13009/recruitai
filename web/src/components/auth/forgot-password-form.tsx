"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { requestPasswordReset } from "@/app/actions/auth";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY_FORM);

  return (
    <FieldGroup>
      <form action={action}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="headline text-4xl">Mot de passe oublié</h1>
            <p className="text-balance text-muted-foreground">
              Indiquez votre e-mail. Si un compte existe, vous recevrez un lien de réinitialisation.
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@agence.fr"
              defaultValue={state.values?.email}
              required
            />
          </Field>
          {state.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
              {state.message}
            </p>
          )}
          <Field>
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Envoyer le lien
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="text-center">
        <Link href="/login">Retour à la connexion</Link>
      </FieldDescription>
    </FieldGroup>
  );
}
