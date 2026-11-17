import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-sm space-y-3">
          <Brand />
          <p>
            Le premier entretien en visio, mené par une IA qui se présente comme telle. La décision reste humaine.
          </p>
        </div>
        <nav aria-label="Liens du pied de page" className="grid grid-cols-2 gap-x-10 gap-y-2">
          <Link href="/demo" className="hover:text-foreground">Essayer l’entretien</Link>
          <Link href="/signup" className="hover:text-foreground">Créer un compte</Link>
          <Link href="/login" className="hover:text-foreground">Connexion</Link>
          <Link href="/confidentialite" className="hover:text-foreground">Données et confidentialité</Link>
        </nav>
      </div>
      <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        Version MVP. Les postes et candidats de démonstration sont fictifs.
      </p>
    </footer>
  );
}
