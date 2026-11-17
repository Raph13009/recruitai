import { JobForm } from "@/components/recruiter/job-form";
import { PageBody, PageHeader, PageIntro } from "@/components/recruiter/page-header";

export const metadata = { title: "Nouveau poste" };

export default function NewJobPage() {
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
