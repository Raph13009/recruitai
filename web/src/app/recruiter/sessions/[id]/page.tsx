import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/components/brand";
import { RecruiterShell, StatusPill } from "@/components/recruiter-shell";
import { getReport, getSessionById, getTranscript } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { ReportFact } from "@/lib/interview/report";

export const metadata = { title: "Compte rendu · RecruitAI", robots: { index: false } };

const FIELD_LABELS: Record<string, string> = {
  availability: "Disponibilité",
  shift_preference: "Créneau",
  salary_expectation: "Attente salariale (€ brut/h)",
};

function Facts({ items }: { items: ReportFact[] }) {
  if (!items.length) return <span className="text-mist">Non recueilli</span>;
  return (
    <ul className="space-y-1">
      {items.map((f, i) => (
        <li key={i}>
          « {f.raw} »
          {f.normalized && <span className="ml-2 rounded bg-teal-soft px-1.5 py-0.5 text-xs text-teal-deep">{f.normalized}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function SessionPage({ params }: PageProps<"/recruiter/sessions/[id]">) {
  return (
    <RecruiterShell>
      <Suspense fallback={<PageSkeleton />}>
        <SessionDetail params={params} />
      </Suspense>
    </RecruiterShell>
  );
}

async function SessionDetail({ params }: Pick<PageProps<"/recruiter/sessions/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) notFound();
  const report = (await getReport(session.id))?.content;
  const transcript = await getTranscript(session.id);

  return (
    <>
      <Link href="/recruiter" className="text-sm text-slate hover:text-ink">← Retour aux entretiens</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="display text-4xl font-semibold">{session.candidate_label}</h1>
        <StatusPill status={session.status} />
      </div>
      <p className="mt-2 text-sm text-slate">
        Créé le {formatDateTime(session.created_at)}
        {session.completed_at && ` · terminé le ${formatDateTime(session.completed_at)}`}
        {session.mode && ` · mode ${session.mode === "avatar" ? "avatar" : "audio seul"}`}
      </p>

      {!report ? (
        <p className="sheet mt-8 p-6 text-slate">
          Pas encore de compte rendu. Il est généré à la fin de l’entretien.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="sheet p-6 sm:p-8">
            <h2 className="display text-2xl font-semibold">Compte rendu factuel</h2>
            <p className="mt-1 text-sm text-slate">{report.notice}</p>
            <dl className="mt-6 space-y-5 text-sm">
              <Row label="Nom donné"><Facts items={report.declared.name ? [report.declared.name] : []} /></Row>
              <Row label="Secteurs d’expérience"><Facts items={report.declared.experience_sector} /></Row>
              <Row label="Tâches déjà faites"><Facts items={report.declared.experience_tasks} /></Row>
              {(["availability", "shift_preference", "salary_expectation"] as const).map((k) => (
                <Row key={k} label={FIELD_LABELS[k]}>
                  <Facts items={report.declared[k] ? [report.declared[k]] : []} />
                </Row>
              ))}
              <Row label="Questions du candidat"><Facts items={report.declared.candidate_questions} /></Row>
            </dl>
            {report.points_to_review.length > 0 && (
              <div className="mt-6 rounded-xl border border-line bg-paper/60 p-4 text-sm">
                <p className="font-semibold">À relire</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate">
                  {report.points_to_review.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-6 text-xs text-mist">
              Score, classement, recommandation d’embauche : vides par conception.
            </p>
          </section>

          <section className="sheet p-6 sm:p-8">
            <h2 className="display text-2xl font-semibold">Transcription</h2>
            {transcript.length === 0 ? (
              <p className="mt-3 text-sm text-mist">Aucun tour de parole enregistré.</p>
            ) : (
              <ol className="mt-4 space-y-3 text-sm">
                {transcript.map((t) => (
                  <li key={t.id}>
                    <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-teal">
                      {t.role === "agent" ? "Camille" : "Candidat"}
                    </span>
                    {t.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr]">
      <dt className="font-medium text-mist">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
