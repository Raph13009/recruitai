import { AlertTriangleIcon, BanIcon, CircleDashedIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TranscriptTurn } from "@/lib/db/types";
import { formatEur } from "@/lib/format";
import type { InterviewReport, ReportFact } from "@/lib/interview/report";
import { formatFrDate, isIsoDate } from "@/lib/job";
import { cn } from "@/lib/utils";

const NOT_COLLECTED_LABELS: Record<string, string> = {
  experience_sector: "Expérience",
  availability: "Disponibilité",
  shift_preference: "Créneau",
  salary_expectation: "Attente salariale",
};

function availabilityLabel(value: string): string {
  if (value === "immediate") return "immédiate";
  return isIsoDate(value) ? `à partir du ${formatFrDate(value)}` : value;
}

function salaryLabel(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${formatEur(n)} brut/h` : value;
}

function sectorLabel(value: string): string {
  return value === "aucune" ? "aucune expérience déclarée" : value;
}

function Facts({ items, format }: { items: ReportFact[]; format?: (normalized: string) => string }) {
  if (!items.length) return <span className="text-muted-foreground">Non recueilli</span>;
  return (
    <ul className="space-y-1.5">
      {items.map((fact, i) => (
        <li key={i} className="leading-relaxed">
          {`«\u00a0${fact.raw}\u00a0»`}
          {fact.normalized && (
            <span className="ml-2 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
              {format ? format(fact.normalized) : fact.normalized}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const one = (fact: ReportFact | null) => (fact ? [fact] : []);

/** The factual report: what the candidate declared, in their own words, and what to double-check. */
export function ReportView({ report }: { report: InterviewReport }) {
  const d = report.declared;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-2xl font-semibold">Compte rendu factuel</CardTitle>
        <CardDescription>{report.notice}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="divide-y">
          <Row label="Prénom donné">
            <Facts items={one(d.name)} />
          </Row>
          <Row label="Expérience">
            <Facts items={d.experience_sector} format={sectorLabel} />
          </Row>
          <Row label="Tâches déjà faites">
            <Facts items={d.experience_tasks} />
          </Row>
          <Row label="Disponibilité">
            <Facts items={one(d.availability)} format={availabilityLabel} />
          </Row>
          <Row label="Créneau">
            <Facts items={one(d.shift_preference)} />
          </Row>
          <Row label="Attente salariale">
            <Facts items={one(d.salary_expectation)} format={salaryLabel} />
          </Row>
          <Row label="Questions posées">
            <Facts items={d.candidate_questions} />
          </Row>
        </dl>

        {report.points_to_review.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-warning">
              <AlertTriangleIcon className="size-4" /> À relire
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/85">
              {report.points_to_review.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {report.not_collected.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CircleDashedIcon className="mt-0.5 size-4 shrink-0" />
            Non recueilli : {report.not_collected.map((f) => NOT_COLLECTED_LABELS[f] ?? f).join(", ")}.
          </p>
        )}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <BanIcon className="size-3.5" /> Score, classement et recommandation d’embauche : vides par conception.
        </p>
      </CardContent>
    </Card>
  );
}

/** The conversation, as text. Audio and video were never recorded. */
export function TranscriptView({ turns, persona }: { turns: TranscriptTurn[]; persona: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-2xl font-semibold">Transcription</CardTitle>
        <CardDescription>
          {turns.length ? `${turns.length} prises de parole. Texte seulement, ni audio ni vidéo.` : "Aucune prise de parole enregistrée."}
        </CardDescription>
      </CardHeader>
      {turns.length > 0 && (
        <CardContent>
          <ol className="space-y-3">
            {turns.map((turn) => {
              const agent = turn.role === "agent";
              return (
                <li key={turn.id} className={cn("flex", agent ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      agent ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-primary text-primary-foreground",
                    )}
                  >
                    <p className={cn("mb-0.5 text-[11px] font-semibold uppercase tracking-wider", agent ? "text-primary" : "text-primary-foreground/75")}>
                      {agent ? `${persona} · IA` : "Candidat"}
                    </p>
                    {turn.text}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
