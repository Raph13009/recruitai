import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionRecruiterId } from "@/lib/auth/session";
import { getAgency, getRecruiter } from "@/lib/db";
import type { CurrentRecruiter } from "@/lib/db/types";

// Data Access Layer for accounts: every page, Server Action and Route Handler of the recruiter
// space goes through here, so the session is checked next to the data and never trusted from the UI.

/** The signed-in recruiter, or null. Memoized for the duration of one render. */
export const getCurrentRecruiter = cache(async (): Promise<CurrentRecruiter | null> => {
  const recruiterId = await readSessionRecruiterId();
  if (!recruiterId) return null;
  const recruiter = await getRecruiter(recruiterId);
  const agency = recruiter && (await getAgency(recruiter.agency_id));
  if (!recruiter || !agency) return null;
  return {
    id: recruiter.id,
    full_name: recruiter.full_name,
    email: recruiter.email,
    agency: { id: agency.id, name: agency.name },
  };
});

/** For pages and Server Actions: sends anonymous visitors to the sign-in page. */
export async function requireRecruiter(): Promise<CurrentRecruiter> {
  const recruiter = await getCurrentRecruiter();
  if (!recruiter) redirect("/login");
  return recruiter;
}
