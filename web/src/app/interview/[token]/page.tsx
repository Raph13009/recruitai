import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { InterviewFlow } from "@/components/interview/interview-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionContext, toCandidatePayload } from "@/lib/db";
import { plannedExperience } from "@/lib/interview/experience";

export const metadata = { title: "Entretien", robots: { index: false, follow: false } };

export default function InterviewPage({ params }: PageProps<"/interview/[token]">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        {/* No link on the logo: leaving by mistake would end the interview. */}
        <Brand href={null} />
      </header>
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
    <div aria-hidden className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-2 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
      <Skeleton className="aspect-video w-full rounded-3xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
