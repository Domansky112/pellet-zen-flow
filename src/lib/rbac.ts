export type AppRole = "admin" | "sales" | "warehouse" | "transport" | "logistyk";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrator",
  sales: "Handlowiec",
  warehouse: "Magazynier",
  transport: "Kierowca / Transport",
  logistyk: "Logistyk",
};

/** Ścieżki chronione → role, które mają dostęp. */
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/dashboard": ["admin", "sales", "warehouse", "transport", "logistyk"],
  "/crm": ["admin", "sales", "logistyk"],
  "/magazyn": ["admin", "warehouse", "logistyk", "sales"],
  "/transport": ["admin", "transport", "logistyk"],
  "/konsolidacja": ["admin", "transport", "logistyk"],
  "/kalendarz": ["admin", "sales", "transport", "logistyk"],
  "/historia": ["admin", "sales", "warehouse", "logistyk"],
  "/platnosci": ["admin"],
  "/bot": ["admin", "warehouse", "logistyk"],
  "/ustawienia": ["admin"],
};

/** Domyślny pulpit dla roli (pierwsza pasująca rola użytkownika wygrywa). */
export const DEFAULT_ROUTE: Record<AppRole, string> = {
  admin: "/dashboard",
  sales: "/dashboard",
  logistyk: "/dashboard",
  warehouse: "/magazyn",
  transport: "/kalendarz",
};

export function allowedRolesFor(pathname: string): AppRole[] | null {
  const key = Object.keys(ROUTE_ROLES).find(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  return key ? ROUTE_ROLES[key]! : null;
}

export function canAccess(pathname: string, roles: AppRole[]): boolean {
  const allowed = allowedRolesFor(pathname);
  if (!allowed) return true; // trasa bez ograniczeń
  return roles.some((r) => allowed.includes(r));
}

export function defaultRouteFor(roles: AppRole[]): string {
  const order: AppRole[] = ["admin", "logistyk", "sales", "warehouse", "transport"];
  const role = order.find((r) => roles.includes(r));
  return role ? DEFAULT_ROUTE[role] : "/403";
}
