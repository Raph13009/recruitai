import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createSession, persistSession } from "@/lib/db/mock";

// Creates a fresh demo session and sends the visitor to the candidate flow.
export default function DemoPage() {
  return (
    <Suspense fallback={<p className="p-10 text-slate">Préparation de l’entretien…</p>}>
      <StartDemo />
    </Suspense>
  );
}

async function StartDemo(): Promise<never> {
  await connection();
  const session = createSession({ candidateLabel: "Candidat démo" });
  if (!session) throw new Error("Poste de démo introuvable.");
  await persistSession(session.id);
  redirect(`/interview/${session.token}`);
}
