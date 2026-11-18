import type { CSSProperties } from "react";
import { CheckIcon, LockIcon, MapPinIcon } from "lucide-react";
import { Waveform } from "@/components/brand";
import { cn } from "@/lib/utils";

// The hero's moving backdrop: what a day of interviews looks like, drifting like a video still.
// Every person, quote and figure here is fictional.

type WallCard =
  | { kind: "candidate"; initials: string; name: string; role: string; place: string; status: "done" | "live" | "invited" }
  | { kind: "said"; who: "candidate" | "agent"; text: string }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "job"; title: string; meta: string; pay: string }
  | { kind: "count"; label: string; value: string }
  | { kind: "guard" };

const COLUMNS: WallCard[][] = [
  [
    { kind: "candidate", initials: "IB", name: "Inès B.", role: "Préparatrice de commandes", place: "Lyon 7e", status: "done" },
    { kind: "said", who: "candidate", text: "Je peux commencer lundi, plutôt le matin." },
    { kind: "facts", rows: [["Disponibilité", "lundi"], ["Créneau", "6:00–13:00"], ["Salaire", "12,50 € brut/h"]] },
    { kind: "job", title: "Cariste", meta: "Intérim · 3 mois · Vénissieux", pay: "13,10 € brut/h" },
    { kind: "candidate", initials: "KD", name: "Karim D.", role: "Agent de quai", place: "Saint-Priest", status: "live" },
  ],
  [
    { kind: "said", who: "agent", text: "Quel créneau vous convient : 6 h–13 h ou 13 h–20 h ?" },
    { kind: "candidate", initials: "ML", name: "Manon L.", role: "Serveuse", place: "Lyon 2e", status: "invited" },
    { kind: "count", label: "Entretiens terminés aujourd’hui", value: "38" },
    { kind: "said", who: "candidate", text: "Deux ans d’entrepôt, surtout du tri de colis." },
    { kind: "guard" },
  ],
  [
    { kind: "job", title: "Commis de cuisine", meta: "CDD · soirs et week-ends · Lyon", pay: "11,88 € brut/h" },
    { kind: "candidate", initials: "SA", name: "Sofiane A.", role: "Vendeur", place: "Villeurbanne", status: "done" },
    { kind: "said", who: "agent", text: "Merci Sofiane. Une personne de l’agence lira le compte rendu." },
    { kind: "facts", rows: [["Expérience", "restauration"], ["Disponibilité", "immédiate"], ["Question", "mission prolongeable ?"]] },
    { kind: "candidate", initials: "AN", name: "Awa N.", role: "Aide-soignante", place: "Bron", status: "live" },
  ],
  [
    { kind: "said", who: "candidate", text: "Les deux créneaux me vont." },
    { kind: "job", title: "Hôtesse de caisse", meta: "Saisonnier · 6 semaines · Écully", pay: "11,88 € brut/h" },
    { kind: "candidate", initials: "TM", name: "Théo M.", role: "Manutentionnaire", place: "Corbas", status: "done" },
    { kind: "said", who: "agent", text: "Bonjour, je suis Camille, une IA. On commence ?" },
    { kind: "count", label: "Liens envoyés cette semaine", value: "212" },
  ],
];

/** Seconds per loop, one per column, so the columns never line up. */
const DURATIONS = [54, 66, 48, 72];

const STATUS = {
  done: { label: "Entretien terminé", className: "bg-[#5cb3a1]/20 text-[#bfe6dc]" },
  live: { label: "En cours", className: "bg-amber-300/15 text-amber-100" },
  invited: { label: "Lien envoyé", className: "bg-white/10 text-white/70" },
} as const;

export function CardWall({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none flex gap-4 overflow-hidden px-4 [mask-image:linear-gradient(180deg,transparent,#000_14%,#000_86%,transparent)]",
        className,
      )}
    >
      {COLUMNS.map((cards, i) => (
        <div
          key={i}
          className={cn(
            "flex min-w-0 flex-1 flex-col will-change-transform",
            i % 2 ? "motion-safe:animate-wall-down" : "motion-safe:animate-wall-up",
            i === 2 && "max-md:hidden",
            i === 3 && "max-xl:hidden",
          )}
          style={{ "--wall-duration": `${DURATIONS[i]}s` } as CSSProperties}
        >
          {/* Twice the same cards, each with its own bottom padding: moving by half loops exactly. */}
          {[...cards, ...cards].map((card, j) => (
            <div key={j} className="pb-4">
              <Card card={card} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Card({ card }: { card: WallCard }) {
  const shell = "rounded-2xl bg-white/[0.055] p-4 text-white/85 ring-1 ring-white/10 backdrop-blur-[2px]";
  switch (card.kind) {
    case "candidate": {
      const status = STATUS[card.status];
      return (
        <div className={shell}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0f6b5c] text-xs font-medium text-white">
              {card.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{card.name}</p>
              <p className="truncate text-xs text-white/55">{card.role}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1 text-white/45">
              <MapPinIcon className="size-3 shrink-0" /> <span className="truncate">{card.place}</span>
            </span>
            <span className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5", status.className)}>
              {card.status === "live" && <span className="size-1.5 rounded-full bg-amber-300 motion-safe:animate-pulse" />}
              {card.status === "done" && <CheckIcon className="size-3" />}
              {status.label}
            </span>
          </div>
        </div>
      );
    }
    case "said":
      return (
        <div className={shell}>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
            {card.who === "agent" ? (
              <>
                Camille · IA <Waveform animated className="h-2.5 text-[#5cb3a1]" />
              </>
            ) : (
              "Candidat"
            )}
          </p>
          <p className="mt-2 text-[15px] leading-snug text-white/90">« {card.text} »</p>
        </div>
      );
    case "facts":
      return (
        <div className={shell}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Compte rendu</p>
          <dl className="mt-2.5 space-y-1.5 text-[13px]">
            {card.rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-white/55">{label}</dt>
                <dd className="flex items-center gap-1.5 text-right text-white/90">
                  {value} <CheckIcon className="size-3 text-[#5cb3a1]" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "job":
      return (
        <div className={shell}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Poste ouvert</p>
          <p className="mt-2 text-base font-medium text-white">{card.title}</p>
          <p className="mt-0.5 text-xs text-white/55">{card.meta}</p>
          <p className="mt-3 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/75">{card.pay}</p>
        </div>
      );
    case "count":
      return (
        <div className={shell}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{card.label}</p>
          <p className="headline mt-2 text-4xl text-white">{card.value}</p>
          <div className="mt-3 flex h-6 items-end gap-1">
            {[0.4, 0.65, 0.5, 0.85, 0.7, 1, 0.8].map((h, i) => (
              <span key={i} className="flex-1 rounded-sm bg-[#5cb3a1]/50" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
        </div>
      );
    case "guard":
      return (
        <div className={shell}>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45">
            <LockIcon className="size-3" /> Score
          </p>
          <p className="headline mt-2 text-4xl text-white/80">—</p>
          <p className="mt-1 text-xs text-white/55">Vide par conception : votre équipe décide.</p>
        </div>
      );
  }
}
