import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  ArrowRightIcon, AudioLinesIcon, BanIcon, CaptionsIcon, CheckIcon, EraserIcon, EyeIcon, FileTextIcon,
  LinkIcon, MessageSquareOffIcon, RotateCcwIcon, ScanFaceIcon, SendIcon, ShieldCheckIcon, UserRoundCheckIcon,
} from "lucide-react";
import { CallMockup } from "@/components/site/call-mockup";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Optional still of the AI interviewer for the hero (16:9, at least 1280 px wide). Drop a file at
 * web/public/interviewer.jpg to use it; without it the hero shows the voice presence instead.
 */
const HERO_PORTRAIT = existsSync(path.join(process.cwd(), "public", "interviewer.jpg")) ? "/interviewer.jpg" : undefined;

const STEPS = [
  {
    icon: FileTextIcon,
    title: "Décrivez le poste",
    text: "Lieu, horaires, salaire, tâches. Cette fiche est la seule source de l’IA : elle n’invente rien.",
  },
  {
    icon: SendIcon,
    title: "Envoyez le lien",
    text: "Un lien par candidat, par SMS ou e-mail. L’entretien se passe sur téléphone ou ordinateur, sans rien installer.",
  },
  {
    icon: EyeIcon,
    title: "Lisez le compte rendu",
    text: "Les réponses du candidat, mot pour mot, les écarts avec la fiche à relire et la transcription complète.",
  },
];

const PRESENCE = [
  {
    icon: ScanFaceIcon,
    title: "Un visage, pas un robot",
    text: "Avatar vidéo photoréaliste, lèvres synchronisées sur la voix. Choisissez un visage dans la bibliothèque, ou celui d’un de vos recruteurs, créé à partir d’une vidéo de deux minutes et avec son accord.",
  },
  {
    icon: AudioLinesIcon,
    title: "Une voix qui réagit",
    text: "La voix est générée en temps réel. L’IA rebondit sur chaque réponse, demande un exemple quand c’est vague et recadre poliment quand c’est hors sujet. Le bruit ambiant ne la coupe pas.",
  },
  {
    icon: CaptionsIcon,
    title: "Accessible",
    text: "Sous-titres en direct, réponse par écrit possible, et un écran pensé pour le téléphone autant que pour l’ordinateur.",
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
    a: "Non. Un navigateur récent et un micro suffisent, sur téléphone ou ordinateur. La caméra est facultative.",
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
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <Badge variant="secondary" className="h-6 px-3 text-xs">Entretien vidéo par IA · intérim et volume</Badge>
            <h1 className="display mt-5 text-[clamp(2.6rem,6.5vw,4.6rem)] font-semibold leading-[1.02]">
              Le premier entretien, en visio, mené par une <em className="font-normal text-primary">IA</em>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Un visage photoréaliste, une voix qui répond du tac au tac et rebondit sur chaque réponse. Vos candidats
              passent l’entretien quand ils veulent ; votre équipe lit un compte rendu factuel et décide.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 rounded-full px-6 text-base">
                <Link href="/demo">
                  Essayer l’entretien <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-6 text-base">
                <Link href="/signup">Créer un compte agence</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["L’IA se présente comme une IA", "Aucun score, aucune décision", "Seul le texte est conservé"].map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-primary" /> {point}
                </li>
              ))}
            </ul>
          </div>
          <CallMockup portrait={HERO_PORTRAIT} className="mx-auto w-full max-w-xl lg:max-w-none" />
        </section>

        {/* How it works */}
        <section id="fonctionnement" className="scroll-mt-20 border-t bg-card/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <p className="eyebrow">Fonctionnement</p>
            <h2 className="display mt-3 max-w-2xl text-4xl font-semibold leading-tight">
              Trois étapes, et le premier tri ne vous prend plus vos journées.
            </h2>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
                          <step.icon className="size-4" />
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                      </div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="text-muted-foreground">{step.text}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The video call */}
        <section id="visio" className="scroll-mt-20">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="eyebrow">La visio</p>
              <h2 className="display mt-3 text-4xl font-semibold leading-tight">
                Une vraie présence face au candidat.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Le candidat voit un visage, entend une voix naturelle et parle normalement, comme en visio avec un
                recruteur. Derrière, chaque réponse est rangée au bon endroit du compte rendu.
              </p>
              <Button asChild variant="link" className="mt-4 h-auto px-0 text-base">
                <Link href="/demo">
                  Le tester vous-même <ArrowRightIcon />
                </Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRESENCE.map((item) => (
                <Card key={item.title}>
                  <CardContent className="space-y-2.5">
                    <item.icon className="size-5 text-primary" />
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* What the recruiter reads */}
        <section className="border-y bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <ReportPreview />
            <div>
              <p className="eyebrow">Le compte rendu</p>
              <h2 className="display mt-3 text-4xl font-semibold leading-tight">Des faits, avec les mots du candidat.</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Chaque information garde la phrase exacte du candidat, à côté de sa forme normalisée. Les écarts avec
                la fiche (une disponibilité tardive, une attente salariale différente) sont signalés, sans jugement.
              </p>
              <ul className="mt-6 space-y-2.5 text-muted-foreground">
                {[
                  "Transcription complète de l’échange",
                  "Points à relire, informations non recueillies",
                  "Impression ou export en PDF pour le dossier",
                ].map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-primary" /> {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Guardrails */}
        <section id="garde-fous" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <p className="eyebrow">Garde-fous</p>
            <h2 className="display mt-3 max-w-2xl text-4xl font-semibold leading-tight">
              L’IA recueille. L’humain décide.
            </h2>
            <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {GUARDRAILS.map((item) => (
                <div key={item.title} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <item.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow">Questions</p>
              <h2 className="display mt-3 text-4xl font-semibold leading-tight">Ce qu’on nous demande souvent.</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item, i) => (
                <AccordionItem key={item.q} value={`q${i}`}>
                  <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-brand-foreground sm:px-12">
            <h2 className="display mx-auto max-w-2xl text-4xl font-semibold leading-tight">
              Passez l’entretien vous-même : cinq minutes suffisent.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-brand-foreground/80">
              Puis ouvrez le compte rendu dans l’espace recruteur de démonstration.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="h-11 rounded-full bg-brand-foreground px-6 text-base text-brand hover:bg-brand-foreground/90">
                <Link href="/demo">
                  Essayer l’entretien <ArrowRightIcon />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 rounded-full border-brand-foreground/40 bg-transparent px-6 text-base text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground dark:border-brand-foreground/40 dark:bg-transparent"
              >
                <Link href="/login">
                  <LinkIcon /> Voir l’espace recruteur
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ReportPreview() {
  const rows = [
    { label: "Disponibilité", raw: "Je suis disponible immédiatement", value: "immédiate" },
    { label: "Créneau", raw: "Le premier, celui du matin", value: "6:00–13:00" },
    { label: "Attente salariale", raw: "Autour de 13 euros de l’heure", value: "13 € brut/h" },
  ];
  return (
    <Card className="mx-auto w-full max-w-lg shadow-xl">
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Léa M.</p>
            <p className="text-sm text-muted-foreground">Agent de quai · Lyon</p>
          </div>
          <Badge variant="secondary">Terminé · 5 min</Badge>
        </div>
        <dl className="space-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 sm:grid-cols-[8.5rem_1fr]">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd>
                « {row.raw} »
                <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">{row.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="rounded-xl border bg-muted/50 p-3 text-sm">
          <p className="font-medium">À relire</p>
          <p className="mt-1 text-muted-foreground">Attente salariale déclarée : 13 € brut/h. Fiche : 12,50 € brut/h.</p>
        </div>
        <p className="text-xs text-muted-foreground">Score, classement, recommandation : vides par conception.</p>
      </CardContent>
    </Card>
  );
}
