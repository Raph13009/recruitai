import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRightIcon, BriefcaseIcon, CheckCircle2Icon, CircleIcon, ClockIcon, HourglassIcon, PercentIcon, PlusIcon,
  RadioIcon, ScanFaceIcon,
} from "lucide-react";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { SessionsTable } from "@/components/recruiter/sessions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRecruiter } from "@/lib/auth/dal";
import { getAgency, getDashboard } from "@/lib/db";
import { formatDuration, formatPercent } from "@/lib/format";
import { plannedExperience } from "@/lib/interview/experience";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };

export default function DashboardPage({ searchParams }: PageProps<"/recruiter">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Tableau de bord" }]} />
      <PageBody>
        <Suspense fallback={<PageSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/recruiter">, "searchParams">) {
  const [recruiter, params] = await Promise.all([requireRecruiter(), searchParams]);
  const [{ jobs, sessions, counts }, agency] = await Promise.all([
    getDashboard(recruiter.agency.id),
    getAgency(recruiter.agency.id),
  ]);
  const firstName = recruiter.full_name.split(/\s+/)[0];
  const openJobs = jobs.filter((job) => job.status === "open");
  const jobTitles = new Map(jobs.map((job) => [job.id, job.title]));
  const interviewer = agency?.interviewer;
  const experience = interviewer ? plannedExperience(interviewer) : null;
  const showWelcome = params.bienvenue === "1" || jobs.length === 0;

  const kpis = [
    { label: "Entretiens terminés", value: String(counts.completed), icon: CheckCircle2Icon },
    { label: "En cours", value: String(counts.in_progress), icon: RadioIcon },
    { label: "Liens en attente", value: String(counts.pending), icon: HourglassIcon },
    { label: "Taux de complétion", value: counts.completion_rate === null ? "—" : formatPercent(counts.completion_rate), icon: PercentIcon },
    { label: "Durée moyenne", value: counts.avg_duration_seconds === null ? "—" : formatDuration(counts.avg_duration_seconds), icon: ClockIcon },
  ];

  return (
    <>
      <PageIntro
        title={`Bonjour ${firstName}`}
        description={`${recruiter.agency.name} · ${counts.total} entretien${counts.total > 1 ? "s" : ""} au total`}
        actions={
          <Button asChild>
            <Link href="/recruiter/jobs/new">
              <PlusIcon /> Nouveau poste
            </Link>
          </Button>
        }
      />

      {showWelcome && <GettingStarted hasJob={jobs.length > 0} hasSession={sessions.some((s) => !s.is_synthetic)} />}

      <section aria-label="Indicateurs" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <kpi.icon className="size-3.5" /> {kpi.label}
              </p>
              <p className="display text-3xl font-semibold tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Derniers entretiens</CardTitle>
            <CardDescription>Ouvrez un entretien pour lire son compte rendu.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/recruiter/sessions">
                  Tout voir <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {sessions.length ? (
              <SessionsTable sessions={sessions.slice(0, 6)} jobTitles={jobTitles} compact />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun entretien pour l’instant.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Postes ouverts</CardTitle>
              <CardDescription>{openJobs.length ? "Invitez un candidat depuis la fiche du poste." : "Aucun poste ouvert."}</CardDescription>
            </CardHeader>
            <CardContent>
              {openJobs.length ? (
                <ul className="divide-y">
                  {openJobs.slice(0, 5).map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/recruiter/jobs/${job.id}`} className="block truncate font-medium hover:underline">
                          {job.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {job.location} · {job.completed}/{job.sessions} terminé{job.completed > 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/recruiter/jobs/${job.id}#inviter`}>Inviter</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="p-2">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BriefcaseIcon />
                    </EmptyMedia>
                    <EmptyTitle>Pas encore de poste</EmptyTitle>
                    <EmptyDescription>La fiche du poste est la seule source de l’intervieweur.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild size="sm">
                      <Link href="/recruiter/jobs/new">Créer un poste</Link>
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </CardContent>
          </Card>

          {interviewer && experience && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Votre intervieweur</CardTitle>
                <CardDescription>Ce que voient et entendent vos candidats.</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/recruiter/settings">Régler</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                {interviewer.avatar_preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote preview from the avatar provider
                  <img src={interviewer.avatar_preview_url} alt="" className="size-14 rounded-xl bg-muted object-cover" />
                ) : (
                  <span className="grid size-14 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <ScanFaceIcon className="size-6" />
                  </span>
                )}
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium">
                    {interviewer.persona_name} <span className="text-sm font-normal text-muted-foreground">· voix {interviewer.voice}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={experience.engine === "gemini" ? "default" : "secondary"}>
                      {experience.engine === "gemini" ? "Voix temps réel" : "Mode démo"}
                    </Badge>
                    <Badge variant={experience.video ? "default" : "secondary"}>
                      {experience.video ? (experience.sandbox ? "Avatar (bac à sable)" : "Avatar vidéo") : "Sans vidéo"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function GettingStarted({ hasJob, hasSession }: { hasJob: boolean; hasSession: boolean }) {
  const steps = [
    { done: hasJob, title: "Décrivez un poste", text: "Lieu, horaires, salaire : l’IA ne répond qu’avec cette fiche.", href: "/recruiter/jobs/new", cta: "Créer un poste" },
    { done: false, title: "Réglez l’intervieweur", text: "Son prénom, sa voix et son visage en visio.", href: "/recruiter/settings", cta: "Ouvrir les réglages" },
    { done: hasSession, title: "Invitez un candidat", text: "Un lien personnel, à envoyer par SMS ou e-mail.", href: "/recruiter/jobs", cta: "Choisir un poste" },
  ];
  return (
    <Card className="border-primary/20 bg-accent/40">
      <CardHeader>
        <CardTitle className="text-lg">Bien démarrer</CardTitle>
        <CardDescription>Trois étapes pour faire passer votre premier entretien.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {step.done ? <CheckCircle2Icon className="size-4 text-primary" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                <span className={cn(step.done && "text-muted-foreground line-through")}>
                  {i + 1}. {step.title}
                </span>
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
              {!step.done && (
                <Button asChild variant="link" className="mt-1 h-auto px-0">
                  <Link href={step.href}>
                    {step.cta} <ArrowRightIcon />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
