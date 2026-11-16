import { connection } from "next/server";
import { listSessions } from "@/lib/db/mock";

export async function GET() {
  await connection(); // read per request, never at build time
  return Response.json({ sessions: listSessions() });
}
