import type { ReactNode } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import type { AppRole } from "@/lib/rbac";

export function RoleGuard({
  allowedRoles,
  children,
  fallback = null,
}: {
  allowedRoles: AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { roles, loading } = useUserRole();
  if (loading) return null;
  const ok = roles.some((r) => allowedRoles.includes(r));
  return <>{ok ? children : fallback}</>;
}
