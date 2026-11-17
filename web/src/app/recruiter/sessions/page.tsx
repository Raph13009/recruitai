import Link from "next/link";
import { Suspense } from "react";
import { MessagesSquareIcon } from "lucide-react";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { SessionsTable } from "@/components/recruiter/sessions-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRecruiter } from "@/lib/auth/dal";
import { listJobs, listSessions } from "@/lib/db";
import type { InterviewSession } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Entretiens" };

const FILTERS: { id: string; label: string; match: (s: InterviewSession) => boolean }[] = [
  { id: "tous", label: "Tous", match: () => true },
  { id: "termines", label: "Terminés", match: (s) => s.status === "completed" && s.end_reason !== "left" },
  { id: "interrompus", label: "Interrompus", match: (s) => s.status === "completed" && s.end_reason === "left" },
  { id: "en-cours", label: "En cours", match: (s) => s.status === "in_progress" },
  { id: "en-attente", label: "En attente", match: (s) => s.status === "created" },
];

export default function SessionsPage({ searchParams }: PageProps<"/recruiter/sessions">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Entretiens" }]} />
      <PageBody>
        <PageIntro title="Entretiens" description="Tous les entretiens de votre agence, du plus récent au plus ancien." />
        <Suspense fallback={<PageSkeleton />}>
          <Sessions searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Sessions({ searchParams }: Pick<PageProps<"/recruiter/sessions">, "searchParams">) {
  const [recruiter, params] = await Promise.all([requireRecruiter(), searchParams]);
  const [sessions, jobs] = await Promise.all([listSessions(recruiter.agency.id), listJobs(recruiter.agency.id)]);
  const active = FILTERS.find((f) => f.id === params.statut) ?? FILTERS[0];
  const shown = sessions.filter(active.match);
  const jobTitles = new Map(jobs.map((job) => [job.id, job.title]));

  if (!sessions.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquareIcon />
          </EmptyMedia>
          <EmptyTitle>Aucun entretien</EmptyTitle>
          <EmptyDescription>Invitez un candidat depuis la fiche d’un poste ouvert.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/recruiter/jobs">Voir les postes</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const count = sessions.filter(filter.match).length;
          const current = filter.id === active.id;
          return (
            <Link
              key={filter.id}
              href={filter.id === "tous" ? "/recruiter/sessions" : `/recruiter/sessions?statut=${filter.id}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                current ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label} <span className="ml-1 tabular-nums opacity-75">{count}</span>
            </Link>
          );
        })}
      </nav>
      <Card className="py-0">
        <CardContent className="px-2">
          {shown.length ? (
            <SessionsTable sessions={shown} jobTitles={jobTitles} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Aucun entretien dans cette catégorie.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
