import { Link, useRouterState } from "@tanstack/react-router";
import { Inbox, Warehouse, Truck, CalendarDays, Bot, LayoutDashboard, Flame } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const nav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "CRM Inbox", url: "/crm", icon: Inbox },
  { title: "Magazyn", url: "/magazyn", icon: Warehouse },
  { title: "Transport", url: "/transport", icon: Truck },
  { title: "Kalendarz", url: "/kalendarz", icon: CalendarDays },
  { title: "Bot magazynowy", url: "/bot", icon: Bot },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Flame className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-semibold text-sidebar-foreground">
              Słoneczny Pellet
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">Operating System</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Moduły</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
            SP
          </div>
          <div className="flex flex-col leading-tight text-xs">
            <span className="font-medium text-sidebar-foreground">Zespół handlowy</span>
            <span className="text-sidebar-foreground/60">pelletdrob.pl</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
