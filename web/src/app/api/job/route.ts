import { connection } from "next/server";
import { fail } from "@/lib/api";
import { jobBrief, publicDemoJob } from "@/lib/db";

/** The fictional job behind the public demo. */
export async function GET() {
  await connection(); // read per request, never at build time
  const job = await publicDemoJob();
  return job ? Response.json({ job: jobBrief(job) }) : fail("Poste de démonstration introuvable.", 404);
}
