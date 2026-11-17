import { connection } from "next/server";
import { defaultJob, jobBrief } from "@/lib/db";

export async function GET() {
  await connection(); // read per request, never at build time
  const job = await defaultJob();
  return Response.json({ job: jobBrief(job) });
}
