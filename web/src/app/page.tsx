import { existsSync } from "node:fs";
import path from "node:path";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon, AudioLinesIcon, BanIcon, BriefcaseIcon, CaptionsIcon, EraserIcon, FileTextIcon, HeartHandshakeIcon,
  MessageSquareOffIcon, PackageIcon, RotateCcwIcon, ScanFaceIcon, ShieldCheckIcon, ShoppingBagIcon, UserRoundCheckIcon,
  UtensilsIcon,
} from "lucide-react";
import { CallMockup as VideoCallPicture } from "@/components/site/call-mockup";
import { CallMockup, InviteMockup, JobMockup, ReportMockup } from "@/components/site/landing/app-mockups";
import { Hero } from "@/components/site/landing/hero";
import { ProductTour } from "@/components/site/landing/product-tour";
import { RevealObserver } from "@/components/site/landing/reveal-observer";
import { RolesMarquee } from "@/components/site/landing/roles-marquee";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/**
 * Optional still of the AI interviewer (16:9, at least 1280 px wide) for the video-call picture.
 * Drop a file at web/public/interviewer.jpg; without it the picture shows the voice presence.
 */
const PORTRAIT = existsSync(path.join(process.cwd(), "public", "interviewer.jpg")) ? "/interviewer.jpg" : undefined;

/** Stagger index for scroll reveals. */
const at = (i: number) => ({ "--reveal-i": i }) as CSSProperties;

const TOUR = [
  { id: "poste", title: "Le poste", text: "Lieu, horaires, salaire, tâches : la seule source de l’IA.", panel: <JobMockup /> },
  { id: "lien", title: "Le lien", text: "Un lien par candidat, par SMS ou e-mail. Rien à installer.", panel: <InviteMockup /> },
  { id: "entretien", title: "L’entretien", text: "Cinq minutes en visio, quand le candidat le veut.", panel: <CallMockup /> },
  { id: "compte-rendu", title: "Le compte rendu", text: "Ses mots exacts, les écarts à relire, aucune note.", panel: <ReportMockup /> },
];

const TRADES = [
  {
    tag: "Logistique",
    icon: PackageIcon,
    title: "Agents de quai, préparateurs, caristes",
    text: "Pics d’activité, dizaines de profils à rappeler dans la semaine : chacun passe son entretien dès qu’il reçoit le lien.",
  },
  {
    tag: "Restauration",
    icon: UtensilsIcon,
    title: "Serveurs, commis, plonge",
    text: "Des candidats qui travaillent le soir et le week-end : l’entretien s’adapte à leurs horaires, pas l’inverse.",
  },
  {
    tag: "Commerce",
    icon: ShoppingBagIcon,
    title: "Vendeurs, hôtes de caisse, polyvalents",
    text: "Les saisonniers arrivent tous en même temps : l’IA les reçoit tous, votre équipe choisit.",
  },
  {
    tag: "Santé et services",
    icon: HeartHandshakeIcon,
    title: "Aides-soignants, agents d’entretien",
    text: "Expérience, disponibilités, créneaux : les faits utiles, sans jamais de question sur la santé ou la vie privée.",
  },
  {
    tag: "Intérim",
    icon: BriefcaseIcon,
    title: "Agences et cabinets",
    text: "Un lien par candidat et par mission, et le même compte rendu pour chaque dossier.",
  },
];

const PROBLEMS = [
  {
    problem: "Deux cents candidatures, deux recruteurs. Les bons profils attendent un rappel… et signent ailleurs.",
    answer: "Chaque candidat passe son entretien tout de suite.",
    detail: "Le soir, le week-end, depuis son téléphone : il n’attend plus que vous soyez disponible.",
  },
  {
    problem: "Des notes d’appel qui changent d’un recruteur à l’autre et ne se comparent pas.",
    answer: "Le même compte rendu pour tous.",
    detail: "Expérience, disponibilité, créneau, salaire, questions : avec les mots exacts du candidat.",
  },
  {
    problem: "Des outils de tri qui notent les gens sans dire pourquoi.",
    answer: "Aucune note, aucune décision.",
    detail: "L’IA se présente comme une IA et recueille des faits. Votre équipe lit et décide.",
  },
];

const PRESENCE = [
  {
    icon: ScanFaceIcon,
    title: "Un visage, pas un robot",
    text: "Avatar vidéo photoréaliste, lèvres synchronisées sur la voix. Un visage de la bibliothèque, ou celui d’un de vos recruteurs, avec son accord.",
  },
  {
    icon: AudioLinesIcon,
    title: "Une voix qui rebondit",
    text: "Elle demande un exemple quand c’est vague, recadre poliment quand c’est hors sujet, et le bruit ambiant ne la coupe pas.",
  },
  {
    icon: CaptionsIcon,
    title: "Accessible",
    text: "Sous-titres en direct, réponses écrites possibles, sur téléphone comme sur ordinateur.",
  },
  {
    icon: RotateCcwIcon,
    title: "Robuste",
    text: "Si la vidéo tombe, l’entretien continue en audio. Si la connexion coupe, il reprend là où il s’était arrêté.",
  },
];

const GUARDRAILS = [
  { icon: UserRoundCheckIcon, title: "Transparence", text: "L’IA dit qu’elle est une IA : à l’écran avant l’appel, puis dès sa première phrase." },
  { icon: BanIcon, title: "Pas de verdict", text: "Score, classement et recommandation sont vides par conception, verrouillés jusque dans la base de données." },
  { icon: FileTextIcon, title: "Pas d’invention", text: "Les réponses sur le poste viennent de la fiche. Sinon : « le recruteur vous répondra »." },
  { icon: MessageSquareOffIcon, title: "Pas de questions sensibles", text: "Âge, origine, santé, situation familiale ou papiers ne sont jamais demandés." },
  { icon: ShieldCheckIcon, title: "Texte seulement", text: "Ni audio ni vidéo enregistrés. La caméra du candidat ne quitte pas son appareil." },
  { icon: EraserIcon, title: "Effacement", text: "Un entretien se supprime en un clic, transcription et compte rendu compris." },
];

const FIGURES = [
  { value: "5 min", label: "pour un entretien complet" },
  { value: "24 h/24", label: "le candidat choisit son moment" },
  { value: "100 %", label: "des réponses sur le poste tirées de votre fiche" },
  { value: "0", label: "note, classement ou décision automatique" },
];

const FAQ = [
  {
    q: "Le candidat sait-il qu’il parle à une IA ?",
    a: "Oui. C’est écrit sur la page d’accueil de l’entretien, l’IA le dit dans sa première phrase, et un badge « IA » reste affiché pendant tout l’appel. Si le candidat demande si elle est humaine, elle répond que non.",
  },
  {
    q: "L’IA prend-elle une décision ?",
    a: "Non. Elle recueille des faits : expérience, disponibilité, créneau, attente salariale, questions. Elle ne note pas, ne classe pas et ne dit jamais si la personne est retenue. Une personne de l’agence lit le compte rendu et décide.",
  },
  {
    q: "Qu’est-ce qui est conservé ?",
    a: "Le texte de la conversation et les faits déclarés, avec les mots du candidat. L’audio et la vidéo ne sont pas enregistrés. Chaque entretien peut être supprimé définitivement depuis l’espace recruteur.",
  },
  {
    q: "Le candidat doit-il installer une application ?",
    a: "Non. Un navigateur récent suffit, sur téléphone ou ordinateur. Sans micro, il peut répondre par écrit ; la caméra est facultative.",
  },
  {
    q: "Peut-on donner à l’intervieweur le visage d’un de nos recruteurs ?",
    a: "Oui, avec son accord. L’avatar personnalisé se crée chez notre fournisseur d’avatars à partir d’une vidéo de deux minutes et d’un enregistrement de consentement, puis se choisit dans les réglages de l’agence. L’IA continue de se présenter comme une IA.",
  },
  {
    q: "Et si la connexion est mauvaise ?",
    a: "La vidéo passe en audio sans couper l’entretien. Si la voix se coupe, le candidat reprend en un clic et l’IA repart de ce qui a déjà été dit, sans reposer les mêmes questions.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col font-grotesk">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <RolesMarquee />

        <Section id="fonctionnement">
          <Title>Une plateforme pour recevoir tous vos candidats</Title>
          <div data-reveal className="mt-12">
            <ProductTour steps={TOUR} />
          </div>
        </Section>

        <Section id="metiers" tone="band">
          <Title intro="Les postes où le premier appel prend le plus de temps : beaucoup de candidats, des horaires décalés, peu de recruteurs.">
            Pensé pour vos métiers en tension
          </Title>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRADES.map((trade, i) => (
              <li key={trade.tag} data-reveal style={at(i)}>
                <article className="group flex h-full flex-col rounded-2xl bg-card p-6 ring-1 ring-border transition-shadow duration-200 [@media(hover:hover)]:hover:shadow-[0_24px_50px_-30px_rgb(22_33_43/0.35)]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <trade.icon className="size-5" />
                    </span>
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">{trade.tag}</span>
                  </div>
                  <h3 className="mt-8 text-xl tracking-tight">{trade.title}</h3>
                  <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{trade.text}</p>
                  <Link href="/demo" className="mt-6 inline-flex w-fit items-center gap-1.5 font-medium text-primary">
                    Essayer <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </article>
              </li>
            ))}
            <li data-reveal style={at(TRADES.length)}>
              <Link
                href="/demo"
                className="press group flex h-full min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/35 p-6 text-center transition-colors hover:bg-card"
              >
                <ArrowRightIcon className="size-6 text-primary transition-transform duration-200 group-hover:translate-x-1" />
                <span className="text-lg">Passer l’entretien de démonstration</span>
                <span className="text-sm text-muted-foreground">Un poste fictif, cinq minutes, sans inscription.</span>
              </Link>
            </li>
          </ul>
        </Section>

        <Section id="pourquoi">
          <Title>Le premier appel est le goulot de vos recrutements. On l’a repensé.</Title>
          <div className="mx-auto mt-14 max-w-5xl divide-y divide-border border-y border-border">
            {PROBLEMS.map((row, i) => (
              <div key={row.answer} data-reveal style={at(i)} className="grid gap-6 py-8 md:grid-cols-2 md:gap-12">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Le problème</p>
                  <p className="mt-3 text-lg leading-relaxed text-foreground/70">{row.problem}</p>
                </div>
                <div className="md:border-l md:border-border md:pl-12">
                  <p className="text-xs uppercase tracking-[0.16em] text-primary">Avec RecruitAI</p>
                  <p className="mt-3 text-2xl tracking-tight">{row.answer}</p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{row.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="visio" tone="band">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div data-reveal>
              <VideoCallPicture portrait={PORTRAIT} className="mx-auto w-full max-w-xl lg:max-w-none" />
            </div>
            <div>
              <div data-reveal>
                <p className="eyebrow">La visio</p>
                <h2 className="headline mt-4 text-[clamp(2.2rem,4.2vw,3.25rem)] text-foreground/90">
                  Une vraie présence face au candidat.
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  Le candidat voit un visage, entend une voix naturelle et répond comme en visio avec un recruteur.
                  Derrière, chaque réponse est rangée au bon endroit du compte rendu.
                </p>
              </div>
              <ul className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2">
                {PRESENCE.map((item, i) => (
                  <li key={item.title} data-reveal style={at(i)}>
                    <item.icon className="size-5 text-primary" />
                    <h3 className="mt-3 text-lg tracking-tight">{item.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
            <h2 data-reveal className="headline text-[clamp(2.4rem,4.6vw,3.6rem)] text-foreground/90">
              Le premier entretien n’est pas une formalité. C’est votre marque employeur.
            </h2>
            <div data-reveal style={at(1)} className="space-y-5 self-end text-lg leading-relaxed text-muted-foreground">
              <p>
                Un candidat qui attend trois jours un rappel ne décroche plus. Un candidat reçu tout de suite, avec
                respect et transparence, se souvient de vous.
              </p>
              <p>
                RecruitAI prend la partie répétitive (les mêmes cinq questions, deux cents fois) pour que vos
                recruteurs passent leur temps là où il compte : avec les bonnes personnes.
              </p>
            </div>
          </div>
        </Section>

        <Section id="garde-fous" tone="band">
          <Title intro="Six règles inscrites dans le produit, pas dans une charte.">L’IA recueille. L’humain décide.</Title>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GUARDRAILS.map((item, i) => (
              <li key={item.title} data-reveal style={at(i)} className="rounded-2xl bg-card p-6 ring-1 ring-border">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg tracking-tight">{item.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section>
          <dl className="grid grid-cols-2 gap-y-12 lg:grid-cols-4">
            {FIGURES.map((figure, i) => (
              <div
                key={figure.value}
                data-reveal
                style={at(i)}
                className={cn("px-4 text-center sm:px-8", i > 0 && "lg:border-l lg:border-border", i % 2 === 1 && "max-lg:border-l max-lg:border-border")}
              >
                <dt className="headline text-[clamp(2.8rem,5vw,4rem)] text-primary">{figure.value}</dt>
                <dd className="mx-auto mt-3 max-w-[14rem] text-[15px] leading-snug text-muted-foreground">{figure.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-center text-sm text-muted-foreground/80">Caractéristiques du produit, pas des moyennes clients.</p>
        </Section>

        <Section id="faq" tone="band">
          <Title>Foire aux questions</Title>
          <Accordion data-reveal type="single" collapsible className="mx-auto mt-10 w-full max-w-3xl">
            {FAQ.map((item, i) => (
              <AccordionItem key={item.q} value={`q${i}`} className="border-border">
                <AccordionTrigger className="items-center py-5 text-[17px] hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>

        <section className="px-6 py-20 text-center sm:py-32">
          <h2 data-reveal className="headline mx-auto max-w-5xl text-[clamp(2.6rem,6vw,5rem)] text-foreground/90">
            Vos candidats méritent mieux qu’un rappel dans trois jours.
          </h2>
          <p data-reveal style={at(1)} className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Passez l’entretien vous-même : cinq minutes suffisent. Puis ouvrez le compte rendu dans l’espace recruteur
            de démonstration.
          </p>
          <div data-reveal style={at(2)} className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/demo"
              className="press inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-[#0a4f44]"
            >
              Essayer l’entretien <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/signup"
              className="press inline-flex h-12 items-center rounded-md border border-border bg-card px-7 text-[15px] font-medium transition-colors hover:bg-secondary"
            >
              Créer un compte agence
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}

/** A page section; `band` sets it on the slightly darker paper, like a printed band. */
function Section({ id, tone, children }: { id?: string; tone?: "band"; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-16", tone === "band" && "bg-[#ebe7df]/70")}>
      <div className="mx-auto w-full max-w-7xl px-6 py-16 sm:px-8 sm:py-24 lg:py-28">{children}</div>
    </section>
  );
}

function Title({ intro, children }: { intro?: string; children: ReactNode }) {
  return (
    <div data-reveal className="mx-auto max-w-3xl text-center">
      <h2 className="headline text-[clamp(2.2rem,4.4vw,3.4rem)] text-foreground/90">{children}</h2>
      {intro && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{intro}</p>}
    </div>
  );
}
