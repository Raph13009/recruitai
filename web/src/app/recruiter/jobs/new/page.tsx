import { JobForm } from "@/components/recruiter/job-form";
import { PageBody, PageHeader, PageIntro } from "@/components/recruiter/page-header";
import { requireOwner } from "@/lib/auth/dal";

export const metadata = { title: "Nouveau poste" };

export default async function NewJobPage() {
  await requireOwner();
  return (
    <>
      <PageHeader crumbs={[{ label: "Postes", href: "/recruiter/jobs" }, { label: "Nouveau poste" }]} />
      <PageBody className="max-w-3xl">
        <PageIntro title="Nouveau poste" description="Quelques lignes suffisent. Vous pourrez tout modifier ensuite." />
        <JobForm />
      </PageBody>
    </>
  );
}
