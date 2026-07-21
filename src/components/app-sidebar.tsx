import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Inbox, Warehouse, Truck, CalendarDays, Bot, LayoutDashboard, Flame, LogOut, Users, History, Settings, ChevronRight, Package2, Store, Building2, Settings2, MessageSquare, Users2 } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const nav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "CRM Inbox", url: "/crm", icon: Inbox },
  { title: "Magazyn", url: "/magazyn", icon: Warehouse },
  { title: "Transport", url: "/transport", icon: Truck },
  { title: "Wspólny transport", url: "/konsolidacja", icon: Users },
  { title: "Kalendarz", url: "/kalendarz", icon: CalendarDays },
  { title: "Historia dostaw", url: "/historia", icon: History },
  { title: "Bot magazynowy", url: "/bot", icon: Bot },
] as const;


const SETTINGS_SECTIONS = [
  { value: "fleet", label: "Flota", icon: Truck },
  { value: "users", label: "Użytkownicy CRM", icon: Users2 },
  { value: "products", label: "Słownik produktów", icon: Package2 },
  { value: "warehouses", label: "Magazyny", icon: Store },
  { value: "carriers", label: "Przewoźnicy", icon: Building2 },
  { value: "config", label: "Konfiguracja", icon: Settings2 },
  { value: "templates", label: "Szablony wiadomości", icon: MessageSquare },
  { value: "statuses", label: "Statusy leadów", icon: Settings2 },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const currentSection = useRouterState({
    select: (r) => (r.location.search as { section?: string })?.section ?? "fleet",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      setRole(roles?.map((r) => r.role).join(", ") ?? "");
    });
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Wylogowano");
    navigate({ to: "/auth", replace: true });
  }

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
        {role.includes("admin") && (
          <SidebarGroup>
            <SidebarGroupLabel>Administracja</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/ustawienia"} tooltip="Ustawienia">
                    <Link to="/ustawienia">
                      <Settings />
                      <span>Ustawienia</span>
                      <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
                    </Link>
                  </SidebarMenuButton>
                  {pathname === "/ustawienia" && (
                    <SidebarMenuSub>
                      {SETTINGS_SECTIONS.map((s) => (
                        <SidebarMenuSubItem key={s.value}>
                          <SidebarMenuSubButton asChild isActive={currentSection === s.value}>
                            <Link to="/ustawienia" search={{ section: s.value }}>
                              <s.icon className="h-3.5 w-3.5" />
                              <span>{s.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex flex-col gap-2 px-2 py-2">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
              {(email[0] ?? "?").toUpperCase()}
            </div>
            <div className="flex flex-col leading-tight text-xs min-w-0">
              <span className="font-medium text-sidebar-foreground truncate">{email || "—"}</span>
              <span className="text-sidebar-foreground/60 truncate">{role || "brak roli"}</span>
            </div>
          </div>
          <SidebarMenuButton onClick={signOut} tooltip="Wyloguj">
            <LogOut />
            <span>Wyloguj</span>
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
