import { Suspense } from "react";
import { AgencyAccent } from "@/components/recruiter/agency-accent";
import { AgencyBanner } from "@/components/recruiter/agency-banner";
import { AppSidebar } from "@/components/recruiter/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRecruiter } from "@/lib/auth/dal";

export const metadata = {
  title: { default: "Espace recruteur", template: "%s · RecruitAI" },
  robots: { index: false, follow: false },
};

/**
 * Cookies / session stay inside Suspense so /recruiter* can prerender the shell
 * (Next Cache Components). Accent is applied client-side to avoid streaming a
 * raw `<style>` tag (React hydration #418/#441).
 */
export default function RecruiterLayout({ children }: LayoutProps<"/recruiter">) {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AgencyAccentLoader />
      </Suspense>
      <Suspense
        fallback={
          <div
            aria-hidden
            className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block"
          />
        }
      >
        <RecruiterSidebar />
      </Suspense>
      <SidebarInset>
        <Suspense fallback={null}>
          <RecruiterBanner />
        </Suspense>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

async function AgencyAccentLoader() {
  const { agency } = await requireRecruiter();
  return <AgencyAccent accent={agency.branding.accent_color} />;
}

async function RecruiterSidebar() {
  return <AppSidebar recruiter={await requireRecruiter()} />;
}

async function RecruiterBanner() {
  const { agency } = await requireRecruiter();
  return <AgencyBanner url={agency.branding.banner_url} />;
}
