"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeSession } from "@/app/actions/sessions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copier",
  size = "default",
  variant = "outline",
}: {
  value: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Lien copié");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Copie impossible : sélectionnez le lien à la main.");
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copié" : label}
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <PrinterIcon /> Imprimer
    </Button>
  );
}

/** Deletes an interview with its transcript and report, after confirmation. */
export function DeleteSessionButton({ id, label }: { id: string; label: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2Icon /> Supprimer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer l’entretien de {label} ?</AlertDialogTitle>
          <AlertDialogDescription>
            La transcription et le compte rendu seront effacés définitivement. Le lien d’entretien ne fonctionnera plus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={removeSession}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogAction type="submit" className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/85">
              Supprimer
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
