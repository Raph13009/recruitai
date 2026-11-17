import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentRecruiter } from "@/lib/auth/dal";

export const metadata = { title: "Créer un compte", robots: { index: false } };

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AuthFormSkeleton />}>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}

async function Gate() {
  if (await getCurrentRecruiter()) redirect("/recruiter");
  return <SignupForm />;
}
