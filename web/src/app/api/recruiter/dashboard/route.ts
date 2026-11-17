import { connection } from "next/server";
import { getDashboard } from "@/lib/db";

// Recruiter data from Supabase (or mock). No auth yet: add Supabase Auth + RLS before exposing this.
export async function GET() {
  await connection(); // read per request, never at build time
  return Response.json(await getDashboard());
}
