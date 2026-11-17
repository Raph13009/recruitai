import { redirect } from "next/navigation";
import { createSession, persistSession } from "@/lib/db";

/** Route Handler so Set-Cookie is reliably applied before the redirect (unlike a Server Component). */
export async function GET() {
  const session = await createSession({ candidateLabel: "Candidat démo" });
  if (!session) {
    return Response.json({ error: "Poste de démo introuvable." }, { status: 500 });
  }
  await persistSession(session.id);
  redirect(`/interview/${session.token}`);
}
