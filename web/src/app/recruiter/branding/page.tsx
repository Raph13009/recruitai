import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { BrandingForm } from "@/components/recruiter/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageAgency } from "@/lib/auth/permissions";
import { requireRecruiter } from "@/lib/auth/dal";
import { getAgency } from "@/lib/db";

export const metadata = { title: "Branding" };

export default function BrandingPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Branding" }]} />
      <PageBody className="max-w-4xl">
        <PageIntro
          title="Branding"
          description="Logo, bandeau et couleur visibles dans votre espace et chez le candidat dès le début de la visio."
        />
        <Suspense fallback={<PageSkeleton />}>
          <Branding />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Branding() {
  const recruiter = await requireRecruiter();
  if (!canManageAgency(recruiter.role)) redirect("/recruiter");
  const agency = await getAgency(recruiter.agency.id);
  if (!agency) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Identité visuelle</CardTitle>
        <CardDescription>
          Une mise à jour s’applique à l’espace recruteur et aux prochains chargements d’entretien candidat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BrandingForm branding={agency.branding} />
      </CardContent>
    </Card>
  );
}
