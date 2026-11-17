import { AgencyAccent } from "@/components/recruiter/agency-accent";
import { AgencyBanner } from "@/components/recruiter/agency-banner";
import { AppSidebar } from "@/components/recruiter/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRecruiter } from "@/lib/auth/dal";

export const metadata = {
  title: { default: "Espace recruteur", template: "%s · RecruitAI" },
  robots: { index: false, follow: false },
};

export default async function RecruiterLayout({ children }: LayoutProps<"/recruiter">) {
  // Await once: avoids Suspense fallback/shape mismatches (React #418/#441) between a
  // placeholder `div` and the real sidebar `aside`.
  const recruiter = await requireRecruiter();

  return (
    <SidebarProvider>
      <AgencyAccent accent={recruiter.agency.branding.accent_color} />
      <AppSidebar recruiter={recruiter} />
      <SidebarInset>
        <AgencyBanner url={recruiter.agency.branding.banner_url} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
