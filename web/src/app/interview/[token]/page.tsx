import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageSkeleton, SiteHeader } from "@/components/brand";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { getSessionByToken, toCandidatePayload } from "@/lib/db/mock";

export const metadata = { title: "Entretien · RecruitAI", robots: { index: false } };

export default function InterviewPage({ params }: PageProps<"/interview/[token]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-4">
        <Suspense fallback={<PageSkeleton />}>
          <Room params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Room({ params }: Pick<PageProps<"/interview/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const session = getSessionByToken(token);
  const payload = session && toCandidatePayload(session);
  if (!payload) notFound();
  return <InterviewRoom payload={payload} />;
}
