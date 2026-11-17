import { Suspense } from "react";
import { AgencyBanner } from "@/components/recruiter/agency-banner";
import { AppSidebar } from "@/components/recruiter/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRecruiter } from "@/lib/auth/dal";

export const metadata = {
  title: { default: "Espace recruteur", template: "%s · RecruitAI" },
  robots: { index: false, follow: false },
};

export default function RecruiterLayout({ children }: LayoutProps<"/recruiter">) {
  return (
    <Suspense
      fallback={
        <SidebarProvider>
          <div aria-hidden className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block" />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      }
    >
      <RecruiterShell>{children}</RecruiterShell>
    </Suspense>
  );
}

/**
 * The session is read inside the boundary, so the page shell renders without waiting for it.
 * Agency branding drives the sidebar logo, the banner and the accent used across the recruiter area.
 */
async function RecruiterShell({ children }: { children: React.ReactNode }) {
  const recruiter = await requireRecruiter();
  const { accent_color, banner_url } = recruiter.agency.branding;
  const accent = {
    "--agency-accent": accent_color,
    "--primary": "var(--agency-accent)",
    "--brand": "var(--agency-accent)",
    "--ring": "var(--agency-accent)",
    "--sidebar-primary": "var(--agency-accent)",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={accent}>
      <AppSidebar recruiter={recruiter} />
      <SidebarInset>
        <AgencyBanner url={banner_url} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
