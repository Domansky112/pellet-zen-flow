// Zakres widoczności danych zależny od roli użytkownika.
// Handlowiec (sales, bez admin/logistyk) widzi wyłącznie własne leady,
// transporty ze swoimi leadami oraz historię swoich dostaw.
// W leadach wspólnego transportu dane kontaktowe cudzych leadów są maskowane.

type Client = { from: (t: string) => any };

export type Scope = {
  roles: string[];
  salesOnly: boolean;
  userId: string;
};

export async function getUserScope(supabase: Client, userId: string): Promise<Scope> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  const salesOnly =
    roles.includes("sales") && !roles.some((r) => r === "admin" || r === "logistyk");
  return { roles, salesOnly, userId };
}

/** Id leadów przypisanych do użytkownika (dla ograniczania transportów). */
export async function myLeadIds(supabase: Client, userId: string): Promise<string[]> {
  const { data } = await supabase.from("leads").select("id").eq("assigned_to", userId);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Ukrywa dane kontaktowe leada, który nie należy do handlowca. */
export function maskContact<T extends Record<string, any>>(row: T, owned: boolean): T {
  if (owned) return row;
  return { ...row, phone: null, email: null, contact_hidden: true };
}
