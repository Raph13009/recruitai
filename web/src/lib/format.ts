export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(
    new Date(iso),
  );

/** "17 nov." */
export const formatShortDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

/** 12.5 -> "12,50 €" */
export const formatEur = (amount: number) => `${amount.toFixed(2).replace(".", ",")} €`;

/** 312 -> "5 min 12 s", 45 -> "45 s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${String(rest).padStart(2, "0")} s` : `${minutes} min`;
}

/** 312 -> "05:12" (call timer) */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 0.82 -> "82 %" */
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)} %`;
