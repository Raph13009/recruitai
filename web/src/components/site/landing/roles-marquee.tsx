import type { CSSProperties } from "react";
import { Waveform } from "@/components/brand";

const ROLES = [
  "Agent de quai",
  "Préparatrice de commandes",
  "Cariste",
  "Serveur",
  "Commis de cuisine",
  "Hôtesse de caisse",
  "Vendeur",
  "Aide-soignante",
  "Agent d’entretien",
  "Livreur",
  "Opératrice de production",
  "Téléconseiller",
  "Manutentionnaire",
  "Employée polyvalente",
];

/** The jobs RecruitAI is built for, scrolling by like a ticker. */
export function RolesMarquee() {
  return (
    <section aria-labelledby="roles-title" className="py-12 sm:py-14">
      <div className="mx-auto flex max-w-xl items-center gap-4 px-6">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <h2 id="roles-title" className="text-center text-[15px] text-muted-foreground">
          Pensé pour les métiers qui recrutent en volume
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <ul className="sr-only">
          {ROLES.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
        <div aria-hidden className="flex w-max motion-safe:animate-marquee" style={{ "--marquee-duration": "60s" } as CSSProperties}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {ROLES.map((role) => (
                <span key={role} className="flex items-center">
                  <span className="headline whitespace-nowrap px-6 text-[clamp(1.6rem,2.6vw,2.25rem)] text-foreground/70">
                    {role}
                  </span>
                  <Waveform className="h-4 text-primary/60" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
