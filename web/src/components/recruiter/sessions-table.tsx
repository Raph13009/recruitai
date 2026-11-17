import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { modeLabel, SessionStatusBadge } from "@/components/recruiter/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { durationSeconds } from "@/lib/db";
import type { InterviewSession } from "@/lib/db/types";
import { formatDateTime, formatDuration, formatShortDate } from "@/lib/format";

/** Interviews as a table. Pass `jobTitles` to show which job each interview is for. */
export function SessionsTable({
  sessions,
  jobTitles,
  compact = false,
}: {
  sessions: InterviewSession[];
  jobTitles?: Map<string, string>;
  /** Fewer columns, for narrow cards. */
  compact?: boolean;
}) {
  const wide = !compact;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Candidat</TableHead>
          {jobTitles && <TableHead className="hidden md:table-cell">Poste</TableHead>}
          <TableHead>Statut</TableHead>
          {wide && <TableHead className="hidden lg:table-cell">Format</TableHead>}
          {wide && <TableHead className="hidden sm:table-cell">Durée</TableHead>}
          <TableHead className="hidden sm:table-cell">Créé le</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Ouvrir</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const href = `/recruiter/sessions/${session.id}`;
          const duration = durationSeconds(session);
          return (
            <TableRow key={session.id}>
              <TableCell className="max-w-[14rem]">
                <Link href={href} className="font-medium hover:underline">
                  <span className="block truncate">{session.candidate_label}</span>
                </Link>
                {session.is_synthetic && (
                  <Badge variant="outline" className="mt-1 h-4 px-1.5 text-[10px]">
                    fictif
                  </Badge>
                )}
              </TableCell>
              {jobTitles && (
                <TableCell className={`hidden truncate text-muted-foreground md:table-cell ${compact ? "max-w-[10rem]" : "max-w-[16rem]"}`}>
                  {jobTitles.get(session.job_id) ?? "—"}
                </TableCell>
              )}
              <TableCell>
                <SessionStatusBadge status={session.status} endReason={session.end_reason} />
              </TableCell>
              {wide && (
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {modeLabel(session.mode, session.engine) ?? "—"}
                </TableCell>
              )}
              {wide && (
                <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                  {duration !== null ? formatDuration(duration) : "—"}
                </TableCell>
              )}
              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                {compact ? formatShortDate(session.created_at) : formatDateTime(session.created_at)}
              </TableCell>
              <TableCell>
                <Link href={href} aria-label={`Ouvrir l'entretien de ${session.candidate_label}`} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRightIcon className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
