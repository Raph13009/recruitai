import Link from "next/link";
import { Suspense } from "react";
import { BriefcaseIcon, PlusIcon } from "lucide-react";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { JobStatusBadge } from "@/components/recruiter/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canManageJobs } from "@/lib/auth/permissions";
import { requireRecruiter } from "@/lib/auth/dal";
import { getDashboard } from "@/lib/db";
import { formatDateTime, formatEur } from "@/lib/format";

export const metadata = { title: "Postes" };

export default async function JobsPage() {
  const recruiter = await requireRecruiter();
  const manageJobs = canManageJobs(recruiter.role);
  return (
    <>
      <PageHeader crumbs={[{ label: "Postes" }]} />
      <PageBody>
        <PageIntro
          title="Postes"
          description="Chaque fiche est la seule source d’information de l’intervieweur IA."
          actions={
            manageJobs ? (
              <Button asChild>
                <Link href="/recruiter/jobs/new">
                  <PlusIcon /> Nouveau poste
                </Link>
              </Button>
            ) : undefined
          }
        />
        <Suspense fallback={<PageSkeleton />}>
          <Jobs manageJobs={manageJobs} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Jobs({ manageJobs }: { manageJobs: boolean }) {
  const recruiter = await requireRecruiter();
  const { jobs } = await getDashboard(recruiter.agency.id);

  if (!jobs.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BriefcaseIcon />
          </EmptyMedia>
          <EmptyTitle>Aucun poste</EmptyTitle>
          <EmptyDescription>
            {manageJobs
              ? "Créez une première fiche : lieu, horaires, salaire, tâches."
              : "Aucun poste pour le moment. Demandez à un owner d’en créer un."}
          </EmptyDescription>
        </EmptyHeader>
        {manageJobs && (
          <EmptyContent>
            <Button asChild>
              <Link href="/recruiter/jobs/new">Créer un poste</Link>
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Poste</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="hidden md:table-cell">Salaire</TableHead>
              <TableHead className="hidden sm:table-cell">Entretiens</TableHead>
              <TableHead className="hidden lg:table-cell">Début</TableHead>
              <TableHead className="hidden lg:table-cell pr-4">Modifié le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="max-w-[18rem] pl-4">
                  <Link href={`/recruiter/jobs/${job.id}`} className="block truncate font-medium hover:underline">
                    {job.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">{job.location}</span>
                </TableCell>
                <TableCell>
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                  {formatEur(job.brief.salary_gross_hourly_eur)} /h
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                  {job.completed} terminé{job.completed > 1 ? "s" : ""} / {job.sessions}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{job.brief.start_date_fr}</TableCell>
                <TableCell className="hidden pr-4 text-muted-foreground lg:table-cell">{formatDateTime(job.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
