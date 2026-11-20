"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { resetPassword } from "@/app/actions/auth";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, EMPTY_FORM);

  if (!token) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="headline text-4xl">Lien invalide</h1>
          <p className="text-muted-foreground">Demandez un nouveau lien depuis la page de connexion.</p>
        </div>
        <FieldDescription className="text-center">
          <Link href="/forgot-password">Demander un lien</Link>
        </FieldDescription>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="headline text-4xl">Nouveau mot de passe</h1>
            <p className="text-balance text-muted-foreground">Choisissez un mot de passe d’au moins 8 caractères.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            {state.fieldErrors?.password && (
              <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
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
              Enregistrer
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
