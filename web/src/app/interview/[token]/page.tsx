import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { InterviewFlow } from "@/components/interview/interview-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionContext, toCandidatePayload } from "@/lib/db";
import { plannedExperience } from "@/lib/interview/experience";

export const metadata = { title: "Entretien", robots: { index: false, follow: false } };

export default function InterviewPage({ params }: PageProps<"/interview/[token]">) {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex-1">
        <Suspense fallback={<LobbySkeleton />}>
          <Room params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Room({ params }: Pick<PageProps<"/interview/[token]">, "params">) {
  const { token } = await params;
  // The session, its job sheet and today's start date are read for this request only.
  await connection();
  const found = await getSessionContext(token);
  const payload = found && (await toCandidatePayload(token, plannedExperience(found.agency.interviewer)));
  if (!payload) notFound();
  return <InterviewFlow payload={payload} />;
}

function LobbySkeleton() {
  return (
    <div aria-hidden className="flex min-h-svh flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-11 w-40" />
      </div>
    </div>
  );
}
