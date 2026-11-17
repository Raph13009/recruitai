import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, readJson, recruiterOr401 } from "@/lib/api";
import { createSession } from "@/lib/db";

const bodySchema = z.object({
  jobId: z.string().min(1),
  candidateLabel: z.string().max(80).optional(),
});

/** Creates an interview link for one of the signed-in recruiter's open jobs. */
export async function POST(req: NextRequest) {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  const session = await createSession(auth.recruiter.agency.id, body.data);
  if (!session) return fail("Poste introuvable ou fermé.", 404);
  return Response.json(
    { id: session.id, token: session.token, link: `${req.nextUrl.origin}/interview/${session.token}` },
    { status: 201 },
  );
}
