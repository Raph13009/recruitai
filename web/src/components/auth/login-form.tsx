"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { demoLogin, login } from "@/app/actions/auth";
import { EMPTY_FORM } from "@/app/actions/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const [state, action, pending] = useActionState(login, EMPTY_FORM);

  return (
    <FieldGroup>
      <form action={action}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="headline text-4xl">Connexion</h1>
            <p className="text-balance text-muted-foreground">Accédez à l’espace recruteur de votre agence.</p>
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
          <Field>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {state.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Field>
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Se connecter
            </Button>
          </Field>
        </FieldGroup>
      </form>

      {demoEnabled && (
        <>
          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">ou</FieldSeparator>
          <form action={demoLogin}>
            <Field>
              <Button type="submit" variant="outline" size="lg">
                Explorer avec le compte de démonstration
              </Button>
              <FieldDescription className="text-center">
                Une agence fictive, avec des entretiens d’exemple.
              </FieldDescription>
            </Field>
          </form>
        </>
      )}

      <FieldDescription className="text-center">
        Pas encore de compte ? <Link href="/signup">Créer un compte</Link>
      </FieldDescription>
    </FieldGroup>
  );
}
