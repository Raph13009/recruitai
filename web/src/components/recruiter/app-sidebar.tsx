"use client";

import { AgencyBadge } from "@/components/recruiter/agency-badge";
import { NavMain } from "@/components/recruiter/nav-main";
import { NavSecondary } from "@/components/recruiter/nav-secondary";
import { NavUser } from "@/components/recruiter/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import type { CurrentRecruiter } from "@/lib/db/types";

export function AppSidebar({ recruiter, ...props }: { recruiter: CurrentRecruiter } & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AgencyBadge agency={recruiter.agency.name} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavSecondary className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={recruiter.full_name} email={recruiter.email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
