import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DownloadIcon, HourglassIcon, RadioIcon, SquareIcon } from "lucide-react";
import { closeSession } from "@/app/actions/sessions";
import { CopyButton, DeleteSessionButton, PrintButton } from "@/components/recruiter/actions";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { ReportView, TranscriptView } from "@/components/recruiter/report-view";
import { modeLabel, SessionStatusBadge } from "@/components/recruiter/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRecruiter } from "@/lib/auth/dal";
import { durationSeconds, getAgency, getJob, getReport, getSession, getTranscript } from "@/lib/db";
import { formatDateTime, formatDuration } from "@/lib/format";

export const metadata = { title: "Compte rendu" };

export default function SessionPage({ params }: PageProps<"/recruiter/sessions/[id]">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Entretiens", href: "/recruiter/sessions" }, { label: "Compte rendu" }]} />
      <PageBody>
        <Suspense fallback={<PageSkeleton />}>
          <SessionDetail params={params} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function interviewLink(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const protocol = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocol}://${host}/interview/${token}`;
}

async function SessionDetail({ params }: Pick<PageProps<"/recruiter/sessions/[id]">, "params">) {
  const [{ id }, recruiter] = await Promise.all([params, requireRecruiter()]);
  const session = await getSession(recruiter.agency.id, id);
  if (!session) notFound();
  const [job, report, transcript, agency] = await Promise.all([
    getJob(recruiter.agency.id, session.job_id),
    getReport(session.id),
    getTranscript(session.id),
    getAgency(recruiter.agency.id),
  ]);
  const persona = agency?.interviewer.persona_name ?? "Intervieweur";
  const duration = durationSeconds(session);
  const mode = modeLabel(session.mode, session.engine);
  const link = session.status === "completed" ? null : await interviewLink(session.token);

  const meta = [
    job && (
      <Link key="job" href={`/recruiter/jobs/${job.id}`} className="hover:text-foreground hover:underline">
        {job.title}
      </Link>
    ),
    `Créé le ${formatDateTime(session.created_at)}`,
    session.completed_at && `Terminé le ${formatDateTime(session.completed_at)}`,
    duration !== null && `Durée ${formatDuration(duration)}`,
    mode,
  ].filter(Boolean);

  return (
    <>
      <PageIntro
        title={session.candidate_label}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <SessionStatusBadge status={session.status} endReason={session.end_reason} />
            {session.is_synthetic && <Badge variant="outline">fictif</Badge>}
            {meta.map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </span>
        }
        actions={
          <>
            {report && <PrintButton />}
            <Button asChild variant="outline">
              <a href={`/api/recruiter/sessions/${session.id}/export`} download>
                <DownloadIcon /> Exporter (JSON)
              </a>
            </Button>
            {link && <CopyButton value={link} label="Copier le lien" />}
            {session.status === "in_progress" && (
              <form action={closeSession}>
                <input type="hidden" name="id" value={session.id} />
                <Button type="submit" variant="outline">
                  <SquareIcon /> Clore l’entretien
                </Button>
              </form>
            )}
            <DeleteSessionButton id={session.id} label={session.candidate_label} />
          </>
        }
      />

      {report ? (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <ReportView report={report.content} />
          <TranscriptView turns={transcript} persona={persona} />
        </div>
      ) : session.status === "created" ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HourglassIcon />
                </EmptyMedia>
                <EmptyTitle>En attente du candidat</EmptyTitle>
                <EmptyDescription>
                  Le lien n’a pas encore été utilisé. Le compte rendu apparaîtra ici à la fin de l’entretien.
                </EmptyDescription>
              </EmptyHeader>
              {link && (
                <EmptyContent>
                  <code className="block w-full truncate rounded-md bg-muted px-3 py-2 text-xs">{link}</code>
                  <CopyButton value={link} label="Copier le lien" />
                </EmptyContent>
              )}
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RadioIcon />
                  </EmptyMedia>
                  <EmptyTitle>Entretien en cours</EmptyTitle>
                  <EmptyDescription>
                    Le compte rendu est créé à la fin de l’appel. Si le candidat a fermé la page sans terminer, closez
                    l’entretien pour obtenir le compte rendu de ce qui a été dit.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
          <TranscriptView turns={transcript} persona={persona} />
        </div>
      )}
    </>
  );
}
