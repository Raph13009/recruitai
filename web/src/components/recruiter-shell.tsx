import Link from "next/link";
import { SiteHeader } from "@/components/brand";

export function RecruiterShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader>
        <Link href="/recruiter" className="font-medium text-ink">Espace recruteur</Link>
      </SiteHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-4">{children}</main>
    </>
  );
}

export function StatusPill({ status }: { status: "created" | "in_progress" | "completed" }) {
  const styles = {
    created: "bg-line/60 text-slate",
    in_progress: "bg-amber-100 text-amber-900",
    completed: "bg-teal-soft text-teal-deep",
  } as const;
  const labels = { created: "Lien créé", in_progress: "En cours", completed: "Terminé" } as const;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}
