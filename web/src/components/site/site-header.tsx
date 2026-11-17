import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#visio", label: "La visio" },
  { href: "/#garde-fous", label: "Garde-fous" },
  { href: "/#faq", label: "Questions" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Navigation principale" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Connexion</Link>
          </Button>
          <Button asChild className="rounded-full px-4">
            <Link href="/demo">Essayer</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
