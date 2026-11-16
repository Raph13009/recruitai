import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { createSession } from "@/lib/db/mock";

const bodySchema = z.object({
  jobId: z.string().optional(),
  candidateLabel: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  const session = createSession(body.data);
  if (!session) return fail("Poste introuvable.", 404);
  return Response.json(
    { id: session.id, token: session.token, link: `${req.nextUrl.origin}/interview/${session.token}` },
    { status: 201 },
  );
}
