import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JobForm } from "@/components/recruiter/job-form";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { requireRecruiter } from "@/lib/auth/dal";
import { getJob } from "@/lib/db";

export const metadata = { title: "Modifier le poste" };

export default function EditJobPage({ params }: PageProps<"/recruiter/jobs/[id]/edit">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Postes", href: "/recruiter/jobs" }, { label: "Modifier" }]} />
      <PageBody className="max-w-3xl">
        <Suspense fallback={<PageSkeleton />}>
          <Edit params={params} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Edit({ params }: Pick<PageProps<"/recruiter/jobs/[id]/edit">, "params">) {
  const [{ id }, recruiter] = await Promise.all([params, requireRecruiter()]);
  const job = await getJob(recruiter.agency.id, id);
  if (!job) notFound();
  return (
    <>
      <PageIntro title={`Modifier : ${job.title}`} description="Les entretiens déjà passés gardent la fiche telle qu’elle était." />
      <JobForm job={job} />
    </>
  );
}
