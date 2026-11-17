import { recruiterOr401 } from "@/lib/api";
import { getDashboard } from "@/lib/db";

export async function GET() {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  return Response.json({ agency: auth.recruiter.agency, ...(await getDashboard(auth.recruiter.agency.id)) });
}
