"use client";

import Link from "next/link";
import { Waveform } from "@/components/brand";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/** Top of the sidebar: the product mark and the signed-in agency. */
export function AgencyBadge({ agency, logoUrl }: { agency: string; logoUrl?: string | null }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip={agency}>
          <Link href="/recruiter">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- agency uploads come from arbitrary storage URLs
              <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" />
            ) : (
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Waveform className="h-3.5 gap-[2px] [&>span]:w-[2px]" />
              </span>
            )}
            <span className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{agency}</span>
              <span className="truncate text-xs text-muted-foreground">RecruitAI · espace recruteur</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
