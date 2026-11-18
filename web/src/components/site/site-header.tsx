import Link from "next/link";
import { Brand } from "@/components/brand";

const LINKS = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#metiers", label: "Métiers" },
  { href: "/#garde-fous", label: "Garde-fous" },
  { href: "/#faq", label: "Questions" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-background/95 font-grotesk backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Brand />
        <nav aria-label="Navigation principale" className="hidden items-center gap-7 text-[15px] text-foreground/75 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors duration-150 hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <Link href="/login" className="hidden text-[15px] font-medium text-primary transition-colors hover:text-primary/80 sm:inline">
            Connexion
          </Link>
          <Link
            href="/demo"
            className="press inline-flex h-10 items-center rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-[#0a4f44]"
          >
            Essayer l’entretien
          </Link>
        </div>
      </div>
    </header>
  );
}
