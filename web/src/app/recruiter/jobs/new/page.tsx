import { Suspense } from "react";
import { JobForm } from "@/components/recruiter/job-form";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { requireOwner } from "@/lib/auth/dal";

export const metadata = { title: "Nouveau poste" };

export default function NewJobPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Postes", href: "/recruiter/jobs" }, { label: "Nouveau poste" }]} />
      <PageBody className="max-w-3xl">
        <Suspense fallback={<PageSkeleton />}>
          <NewJob />
        </Suspense>
      </PageBody>
    </>
  );
}

async function NewJob() {
  await requireOwner();
  return (
    <>
      <PageIntro title="Nouveau poste" description="Quelques lignes suffisent. Vous pourrez tout modifier ensuite." />
      <JobForm />
    </>
  );
}
