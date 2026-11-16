import { connection } from "next/server";
import { getDashboard } from "@/lib/db/mock";

// Mock recruiter data. No auth yet: add Supabase auth + RLS before exposing this.
export async function GET() {
  await connection(); // read per request, never at build time
  return Response.json(getDashboard());
}
