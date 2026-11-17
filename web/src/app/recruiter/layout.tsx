import { Suspense } from "react";
import { AppSidebar } from "@/components/recruiter/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRecruiter } from "@/lib/auth/dal";

export const metadata = {
  title: { default: "Espace recruteur", template: "%s · RecruitAI" },
  robots: { index: false, follow: false },
};

export default function RecruiterLayout({ children }: LayoutProps<"/recruiter">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<div aria-hidden className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block" />}>
        <RecruiterSidebar />
      </Suspense>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}

/** The session is read inside the boundary, so the page shell renders without waiting for it. */
async function RecruiterSidebar() {
  const recruiter = await requireRecruiter();
  return <AppSidebar recruiter={recruiter} />;
}
