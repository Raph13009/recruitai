import { connection } from "next/server";
import { z } from "zod";
import { readJson } from "@/lib/api";
import { listJobs, upsertJob } from "@/lib/db";
import { jobFactsSchema } from "@/lib/job";

const bodySchema = z.object({
  id: z.string().optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
  facts: jobFactsSchema,
});

export async function GET() {
  await connection(); // read per request, never at build time
  return Response.json({ jobs: await listJobs() });
}

export async function POST(req: Request) {
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  return Response.json({ job: await upsertJob(body.data) });
}
