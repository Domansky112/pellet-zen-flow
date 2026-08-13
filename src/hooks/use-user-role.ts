import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/rbac";

const VALID: AppRole[] = ["admin", "sales", "warehouse", "transport", "logistyk"];

/** Odczyt ról z tokenu JWT (user_metadata/app_metadata) + tabeli user_roles. */
export async function fetchUserRoles(): Promise<AppRole[]> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return [];
  const user = data.user;
  const meta = { ...(user.app_metadata ?? {}), ...(user.user_metadata ?? {}) } as Record<
    string,
    unknown
  >;
  const jwtRoles = [meta.role, ...(Array.isArray(meta.roles) ? meta.roles : [])].filter(
    (r): r is AppRole => typeof r === "string" && VALID.includes(r as AppRole),
  );
  const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const dbRoles = (rows ?? [])
    .map((r) => r.role as AppRole)
    .filter((r) => VALID.includes(r));
  return Array.from(new Set([...dbRoles, ...jwtRoles]));
}

export function useUserRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchUserRoles().then((r) => {
        if (cancelled) return;
        setRoles(r);
        setLoading(false);
      });
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    roles,
    role: roles[0] ?? null,
    isAdmin: roles.includes("admin"),
    isAuthorized: roles.length > 0,
    loading,
    hasRole: (...r: AppRole[]) => r.some((x) => roles.includes(x)),
  };
}
