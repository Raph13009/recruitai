import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthFormSkeleton, AuthShell } from "@/components/auth/auth-shell";
import { getCurrentRecruiter } from "@/lib/auth/dal";
import { getAgencyInviteByToken } from "@/lib/db";

export const metadata = { title: "Rejoindre l’agence", robots: { index: false } };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <AuthShell>
      <Suspense fallback={<AuthFormSkeleton />}>
        <Gate params={params} />
      </Suspense>
    </AuthShell>
  );
}

async function Gate({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  if (await getCurrentRecruiter()) redirect("/recruiter");
  const { token } = await params;
  const invite = await getAgencyInviteByToken(token);
  if (!invite) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <h1 className="display text-3xl font-semibold">Invitation invalide</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien a expiré, a déjà été utilisé, ou n’existe pas. Demandez une nouvelle invitation à
          votre agence.
        </p>
      </div>
    );
  }
  return <AcceptInviteForm token={invite.token} email={invite.email} agencyName={invite.agency_name} />;
}
