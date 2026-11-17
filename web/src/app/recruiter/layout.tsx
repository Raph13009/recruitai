import { Suspense } from "react";
import { AgencyBanner } from "@/components/recruiter/agency-banner";
import { AppSidebar } from "@/components/recruiter/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRecruiter } from "@/lib/auth/dal";
import { accentVars } from "@/lib/branding";

export const metadata = {
  title: { default: "Espace recruteur", template: "%s · RecruitAI" },
  robots: { index: false, follow: false },
};

export default function RecruiterLayout({ children }: LayoutProps<"/recruiter">) {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AccentStyle />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block" />}>
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

// The session is read inside each boundary, so the page renders without waiting for it
// and `children` is rendered once. requireRecruiter is cached per request.

/** Recolours the whole recruiter area with the agency accent (sidebar and page share the wrapper). */
async function AccentStyle() {
  const { agency } = await requireRecruiter();
  const vars = Object.entries(accentVars(agency.branding.accent_color))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return <style>{`[data-slot="sidebar-wrapper"]{${vars}}`}</style>;
}

async function RecruiterSidebar() {
  return <AppSidebar recruiter={await requireRecruiter()} />;
}

async function RecruiterBanner() {
  const { agency } = await requireRecruiter();
  return <AgencyBanner url={agency.branding.banner_url} />;
}
