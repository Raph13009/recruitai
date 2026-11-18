import Link from "next/link";
import { ArrowRightIcon, ClockIcon, MoonStarIcon, ScaleIcon } from "lucide-react";
import { CardWall } from "@/components/site/landing/card-wall";

const PROOF = [
  { icon: ClockIcon, label: "Environ 5 minutes" },
  { icon: MoonStarIcon, label: "À toute heure" },
  { icon: ScaleIcon, label: "Aucune note, aucun classement" },
];

/** Full-height opening stage: the headline over a drifting wall of interviews. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="hero-stage relative isolate flex min-h-[min(56rem,calc(100svh-4.75rem))] flex-col overflow-hidden rounded-[1.75rem] text-white sm:rounded-[2.25rem]">
        {/* The entrance animation sits on a wrapper: its end state would override the wall's own opacity. */}
        <div className="absolute inset-y-0 right-0 -z-10 w-full motion-safe:animate-[hero-in_1.6s_var(--ease-out-strong)_both] lg:w-[56%]">
          <CardWall className="size-full opacity-[0.14] md:opacity-35 lg:opacity-100" />
        </div>
        {/* Keeps the headline readable over the wall, and the bottom row clear of it. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(15_31_30/0.55),rgb(15_31_30/0.88)_45%,#0f1f1e)] lg:bg-[linear-gradient(90deg,#0f1f1e_0%,#0f1f1e_47%,rgb(15_31_30/0.86)_60%,rgb(15_31_30/0.2)_84%)]"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-t from-[#0f1f1e] via-[#0f1f1e]/90 to-transparent" />
        <div aria-hidden className="grain-light absolute inset-0 -z-10" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 pb-10 pt-16 sm:px-10 lg:px-14">
          <p className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75 motion-safe:animate-hero-in">
            Entretien vidéo par IA · intérim et recrutement en volume
          </p>
          <h1 id="hero-title" className="headline mt-6 max-w-[13.5em] text-[clamp(2.6rem,5.6vw,5.1rem)]">
            <span className="block motion-safe:animate-hero-in [animation-delay:60ms]">Chaque candidat mérite un entretien.</span>
            {/* Non-breaking hyphen: the line never splits on "deux-". */}
            <span className="block text-white/55 motion-safe:animate-hero-in [animation-delay:150ms]">Même le deux‑centième.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/75 motion-safe:animate-hero-in [animation-delay:240ms]">
            Une IA, qui se présente comme telle, mène le premier entretien en visio, quand le candidat le veut. Votre
            équipe lit un compte rendu factuel et décide.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 motion-safe:animate-hero-in [animation-delay:320ms]">
            <Link
              href="/demo"
              className="press inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-[15px] font-medium text-[#0f1f1e] transition-colors hover:bg-white/90"
            >
              Essayer l’entretien <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/signup"
              className="press inline-flex h-12 items-center rounded-md border border-white/25 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
            >
              Créer un compte agence
            </Link>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-6 px-6 pb-8 sm:px-10 lg:px-14 motion-safe:animate-hero-in [animation-delay:420ms]">
          <ul className="flex flex-wrap gap-2">
            {PROOF.map(({ icon: Icon, label }) => (
              <li key={label} className="flex h-9 items-center gap-2 rounded-md bg-white/[0.07] px-3 text-sm text-white/80 ring-1 ring-white/10">
                <Icon className="size-4 text-[#5cb3a1]" /> {label}
              </li>
            ))}
          </ul>
          <p className="max-w-sm text-sm leading-relaxed text-white/65 sm:text-right">
            Logistique, commerce, restauration, services.
            <br />
            Vos candidats passent l’entretien dès qu’ils reçoivent le lien.
          </p>
        </div>
      </div>
    </section>
  );
}
