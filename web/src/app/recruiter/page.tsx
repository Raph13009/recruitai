import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/components/brand";
import { CreateLinkButton } from "@/components/CreateLinkButton";
import { RecruiterShell, StatusPill } from "@/components/recruiter-shell";
import { getDashboard } from "@/lib/db/mock";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Espace recruteur · RecruitAI", robots: { index: false } };

export default function RecruiterPage() {
  return (
    <RecruiterShell>
      <Suspense fallback={<PageSkeleton />}>
        <Dashboard />
      </Suspense>
    </RecruiterShell>
  );
}

async function Dashboard() {
  await connection();
  const { agency, jobs, sessions, counts } = getDashboard();

  return (
    <>
      <p className="eyebrow">{agency.name}</p>
      <h1 className="display mt-2 text-4xl font-semibold">Entretiens</h1>
      <p className="mt-2 text-slate">
        {counts.total} entretien{counts.total > 1 ? "s" : ""} · {counts.completed} terminé{counts.completed > 1 ? "s" : ""}
        {counts.in_progress ? ` · ${counts.in_progress} en cours` : ""}. Données de démonstration en mémoire.
      </p>

      <section className="mt-10 space-y-6">
        {jobs.map((job) => (
          <article key={job.id} className="sheet p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl font-semibold">{job.title}</h2>
                <p className="mt-1 text-sm text-slate">
                  {job.location} · {job.brief.contract} · {job.brief.salary_gross_hourly_eur.toFixed(2).replace(".", ",")} €
                  brut/h · début le {job.brief.start_date_fr}
                </p>
              </div>
              <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-medium text-teal-deep">
                {job.status === "open" ? "Ouvert" : job.status === "draft" ? "Brouillon" : "Fermé"}
              </span>
            </div>
            <div className="mt-6">
              <CreateLinkButton jobId={job.id} />
            </div>
          </article>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl font-semibold">Sessions récentes</h2>
        <ul className="sheet mt-4 divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="font-medium">
                  {s.candidate_label}
                  {s.is_synthetic && <span className="ml-2 text-xs text-mist">fictif</span>}
                </p>
                <p className="text-sm text-mist">{formatDateTime(s.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={s.status} />
                <Link className="btn-ghost px-4 py-1.5" href={`/recruiter/sessions/${s.id}`}>
                  {s.status === "completed" ? "Ouvrir le compte rendu" : "Détails"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
