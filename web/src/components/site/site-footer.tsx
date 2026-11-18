import Link from "next/link";
import { Brand } from "@/components/brand";

const COLUMNS = [
  {
    title: "Produit",
    links: [
      { href: "/demo", label: "Essayer l’entretien" },
      { href: "/#fonctionnement", label: "Fonctionnement" },
      { href: "/#garde-fous", label: "Garde-fous" },
      { href: "/#faq", label: "Questions" },
    ],
  },
  {
    title: "Agences",
    links: [
      { href: "/signup", label: "Créer un compte" },
      { href: "/login", label: "Connexion" },
    ],
  },
  {
    title: "Données",
    links: [{ href: "/confidentialite", label: "Données et confidentialité" }],
  },
];

/** Deep teal footer of the public pages (the `dark` tokens give light text and a lighter teal). */
export function SiteFooter() {
  return (
    <footer className="dark bg-[#0d2b27] font-grotesk text-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 sm:px-8 lg:grid-cols-[1.3fr_2fr]">
        <div className="max-w-sm space-y-4">
          <Brand />
          <p className="text-[15px] leading-relaxed text-foreground/65">
            Le premier entretien en visio, mené par une IA qui se présente comme telle. La décision reste humaine.
          </p>
        </div>
        <nav aria-label="Liens du pied de page" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{column.title}</p>
              <ul className="mt-4 space-y-3 text-[15px]">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-foreground/80 transition-colors duration-150 hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-7xl border-t border-white/10 px-6 py-6 text-[13px] text-foreground/45 sm:px-8">
        © 2026 RecruitAI · Version MVP. Les postes et candidats de démonstration sont fictifs.
      </div>
    </footer>
  );
}
