"use client";

import Link from "next/link";
import { ExternalLinkIcon, PlayCircleIcon } from "lucide-react";
import {
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary(props: React.ComponentProps<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm" tooltip="Essayer en candidat">
              <Link href="/demo" target="_blank" rel="noreferrer">
                <PlayCircleIcon />
                <span>Essayer en candidat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm" tooltip="Voir le site">
              <Link href="/">
                <ExternalLinkIcon />
                <span>Voir le site</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
