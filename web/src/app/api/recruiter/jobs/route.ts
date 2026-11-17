import { z } from "zod";
import { fail, readJson, recruiterOr401 } from "@/lib/api";
import { listJobs, upsertJob } from "@/lib/db";
import { jobFactsSchema } from "@/lib/job";

const bodySchema = z.object({
  id: z.string().optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
  facts: jobFactsSchema,
});

export async function GET() {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  return Response.json({ jobs: await listJobs(auth.recruiter.agency.id) });
}

export async function POST(req: Request) {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  // The agency name on the sheet always comes from the account, never from the request.
  const facts = { ...body.data.facts, agency: auth.recruiter.agency.name };
  const job = await upsertJob(auth.recruiter.agency.id, { ...body.data, facts });
  return job ? Response.json({ job }) : fail("Poste introuvable.", 404);
}
