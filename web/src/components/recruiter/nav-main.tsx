"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, LayoutDashboardIcon, MessagesSquareIcon, Settings2Icon } from "lucide-react";
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const ITEMS = [
  { href: "/recruiter", label: "Tableau de bord", icon: LayoutDashboardIcon, exact: true },
  { href: "/recruiter/jobs", label: "Postes", icon: BriefcaseIcon },
  { href: "/recruiter/sessions", label: "Entretiens", icon: MessagesSquareIcon },
  { href: "/recruiter/settings", label: "Réglages", icon: Settings2Icon },
];

export function NavMain() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recrutement</SidebarGroupLabel>
      <SidebarMenu>
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => isMobile && setOpenMobile(false)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
