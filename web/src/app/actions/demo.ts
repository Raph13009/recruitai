"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createPublicDemoSession } from "@/lib/db";
import { env } from "@/lib/env";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

/**
 * "Try the interview": creates a candidate link on the fictional demo job and opens it.
 * A form action (POST) on purpose: nothing is created by simply loading or prefetching a page.
 */
export async function startDemo(): Promise<void> {
  if (!env.publicDemo()) redirect("/demo?indisponible=1");
  // Each demo can spend voice and avatar credits: keep one visitor from opening dozens.
  if (!rateLimit(`demo:${clientAddress(await headers())}`, 10, 10 * 60_000)) redirect("/demo?limite=1");
  const session = await createPublicDemoSession();
  if (!session) redirect("/demo?indisponible=1");
  redirect(`/interview/${session.token}`);
}
