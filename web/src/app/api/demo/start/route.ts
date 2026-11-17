import { redirect } from "next/navigation";

/**
 * Kept so existing links keep working. Starting a demo is now a POST from /demo (Server Action
 * `startDemo`): a plain GET must not create sessions, since crawlers and link prefetching would
 * fill the database with empty interviews. The Server Action also sets the candidate cookie on
 * serverless hosts.
 */
export async function GET() {
  redirect("/demo");
}
