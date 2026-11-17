import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LockIcon, MessagesSquareIcon, PencilIcon, UnlockIcon } from "lucide-react";
import { changeJobStatus } from "@/app/actions/jobs";
import { InviteCandidate } from "@/components/recruiter/invite-candidate";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { SessionsTable } from "@/components/recruiter/sessions-table";
import { JobStatusBadge } from "@/components/recruiter/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRecruiter } from "@/lib/auth/dal";
import { getJob, jobBrief, listSessions } from "@/lib/db";
import { formatEur } from "@/lib/format";

export const metadata = { title: "Poste" };

export default function JobPage({ params }: PageProps<"/recruiter/jobs/[id]">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Postes", href: "/recruiter/jobs" }, { label: "Fiche du poste" }]} />
      <PageBody>
        <Suspense fallback={<PageSkeleton />}>
          <JobDetail params={params} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function JobDetail({ params }: Pick<PageProps<"/recruiter/jobs/[id]">, "params">) {
  const [{ id }, recruiter] = await Promise.all([params, requireRecruiter()]);
  const job = await getJob(recruiter.agency.id, id);
  if (!job) notFound();
  const brief = jobBrief(job);
  const sessions = await listSessions(recruiter.agency.id, { jobId: job.id });
  const open = job.status === "open";

  const facts: [string, string][] = [
    ["Lieu", brief.location],
    ["Contrat", brief.contract],
    ["Début", brief.start_date_fr],
    ["Horaires", brief.working_hours.join(" ou ")],
    ["Salaire", `${formatEur(brief.salary_gross_hourly_eur)} brut de l’heure`],
    ["Tâches", brief.tasks],
    ["Expérience", brief.experience],
  ];

  return (
    <>
      <PageIntro
        title={job.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span>{job.location}</span>
            {brief.disclaimer && <Badge variant="outline">fictif</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/recruiter/jobs/${job.id}/edit`}>
                <PencilIcon /> Modifier
              </Link>
            </Button>
            <form action={changeJobStatus}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="status" value={open ? "closed" : "open"} />
              <Button type="submit" variant={open ? "outline" : "default"}>
                {open ? <LockIcon /> : <UnlockIcon />}
                {open ? "Fermer le poste" : "Ouvrir le poste"}
              </Button>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card id="inviter" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="text-lg">Inviter un candidat</CardTitle>
              <CardDescription>
                Chaque candidat reçoit son propre lien. Il passe l’entretien quand il veut, en visio, depuis son téléphone ou son ordinateur.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {open ? (
                <InviteCandidate jobId={job.id} jobTitle={job.title} agency={recruiter.agency.name} />
              ) : (
                <Alert>
                  <LockIcon />
                  <AlertDescription>Ce poste n’accepte pas de nouveaux entretiens. Ouvrez-le pour inviter un candidat.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entretiens pour ce poste</CardTitle>
              <CardDescription>
                {sessions.length} entretien{sessions.length > 1 ? "s" : ""}, dont {sessions.filter((s) => s.status === "completed").length} terminé
                {sessions.filter((s) => s.status === "completed").length > 1 ? "s" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.length ? (
                <SessionsTable sessions={sessions} />
              ) : (
                <Empty className="p-4">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessagesSquareIcon />
                    </EmptyMedia>
                    <EmptyTitle>Aucun entretien</EmptyTitle>
                    <EmptyDescription>Créez un lien ci-dessus et envoyez-le à un candidat.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Fiche du poste</CardTitle>
            <CardDescription>La seule source d’information de l’intervieweur.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="[overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
