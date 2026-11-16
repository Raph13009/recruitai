import Link from "next/link";
import { SiteHeader, Waveform } from "@/components/brand";

export default function Home() {
  return (
    <>
      <SiteHeader>
        <Link href="/recruiter" className="hover:text-ink">Espace recruteur</Link>
      </SiteHeader>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <p className="eyebrow">Entretien structuré par IA</p>
          <h1 className="display mt-5 text-[clamp(3.5rem,9vw,7rem)] font-semibold leading-[0.95]">
            Recruit<span className="text-teal">AI</span>
          </h1>
          <p className="display mt-6 max-w-xl text-2xl leading-snug text-ink/90 sm:text-3xl">
            Un premier entretien qui recueille les faits, jamais le verdict.
          </p>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate">
            Camille, assistante vocale IA, pose les mêmes questions à chaque candidat. Votre équipe lit un compte rendu
            factuel, sans score ni classement.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/demo" className="btn-primary px-6 py-3 text-base">Essayer l’entretien candidat</Link>
            <Link href="/recruiter" className="btn-ghost px-6 py-3 text-base">Ouvrir l’espace recruteur</Link>
          </div>
          <p className="mt-6 text-sm text-mist">
            Démo avec un poste fictif : agent de quai à Lyon, Interim Express.
          </p>
        </section>

        <section aria-hidden className="relative hidden h-[26rem] items-center justify-center lg:flex">
          <div className="absolute inset-0 rounded-[2.5rem] border border-line bg-gradient-to-br from-sheet/90 to-teal-soft/60" />
          <div className="absolute inset-6 rounded-[2rem] border border-dashed border-teal/25" />
          <Waveform className="relative h-40 gap-2 text-teal [&>span]:w-2" />
        </section>
      </main>
    </>
  );
}
