import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col font-grotesk">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Brand />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="eyebrow">Erreur 404</p>
        <h1 className="headline mt-4 text-5xl text-foreground/90">Cette page n’existe pas.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">Le lien est peut-être incomplet, ou la page a été déplacée.</p>
        <Button asChild className="mt-8 rounded-full px-5">
          <Link href="/">Retour à l’accueil</Link>
        </Button>
      </main>
    </div>
  );
}
