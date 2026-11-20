import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentRecruiter } from "@/lib/auth/dal";
import { env } from "@/lib/env";

export const metadata = { title: "Connexion", robots: { index: false } };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  return (
    <AuthShell>
      <Suspense fallback={<AuthFormSkeleton />}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

/** Already signed in: straight to the recruiter space. Otherwise, the form. */
async function Gate({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getCurrentRecruiter()) redirect("/recruiter");
  const { reset } = await searchParams;
  return <LoginForm demoEnabled={env.demoLogin()} resetDone={reset === "1"} />;
}
