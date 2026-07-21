import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ================================================================
// Helpers
// ================================================================
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Brak uprawnień administratora");
}

// ================================================================
// FLEET — Vehicles
// ================================================================
export const listVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fleet_vehicles")
      .select("*")
      .order("registration");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const VehicleInput = z.object({
  id: z.string().uuid().optional(),
  registration: z.string().min(2).max(20),
  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  capacity_tons: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(["aktywny", "serwis", "wycofany"]).default("aktywny"),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VehicleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("fleet_vehicles").update(rest).eq("id", id).select().single()
      : context.supabase.from("fleet_vehicles").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("fleet_vehicles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// FLEET — Trailers
// ================================================================
export const listTrailers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fleet_trailers")
      .select("*")
      .order("registration");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const TrailerInput = z.object({
  id: z.string().uuid().optional(),
  registration: z.string().min(2).max(20),
  trailer_type: z.string().max(80).nullable().optional(),
  capacity_tons: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(["aktywny", "serwis", "wycofany"]).default("aktywny"),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertTrailer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrailerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("fleet_trailers").update(rest).eq("id", id).select().single()
      : context.supabase.from("fleet_trailers").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTrailer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("fleet_trailers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// FLEET — Drivers
// ================================================================
export const listDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fleet_drivers")
      .select("*, vehicle:fleet_vehicles(id, registration), trailer:fleet_trailers(id, registration)")
      .order("last_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const DriverInput = z.object({
  id: z.string().uuid().optional(),
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(120).nullable().optional().or(z.literal("")),
  vehicle_id: z.string().uuid().nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  status: z.enum(["aktywny", "urlop", "nieaktywny"]).default("aktywny"),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DriverInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, email, ...rest } = data;
    const payload = { ...rest, email: email === "" ? null : email };
    const q = id
      ? context.supabase.from("fleet_drivers").update(payload).eq("id", id).select().single()
      : context.supabase.from("fleet_drivers").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("fleet_drivers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// External carriers
// ================================================================
export const listCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("external_carriers")
      .select("*")
      .order("company_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CarrierInput = z.object({
  id: z.string().uuid().optional(),
  company_name: z.string().min(1).max(200),
  nip: z.string().max(20).nullable().optional(),
  contact_person: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(120).nullable().optional().or(z.literal("")),
  base_rate_per_km: z.number().min(0).max(1000).nullable().optional(),
  status: z.enum(["aktywny", "nieaktywny"]).default("aktywny"),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CarrierInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, email, ...rest } = data;
    const payload = { ...rest, email: email === "" ? null : email };
    const q = id
      ? context.supabase.from("external_carriers").update(payload).eq("id", id).select().single()
      : context.supabase.from("external_carriers").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("external_carriers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// Product definitions
// ================================================================
export const listProductDefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("product_definitions")
      .select("*")
      .order("label");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ProductDefInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(120),
  packaging: z.string().max(40).nullable().optional(),
  unit_weight_kg: z.number().min(0).max(100000).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertProductDef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProductDefInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("product_definitions").update(rest).eq("id", id).select().single()
      : context.supabase.from("product_definitions").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProductDef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("product_definitions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// Warehouses
// ================================================================
export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("warehouses")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const WarehouseInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  address_line: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  country: z.string().max(80).default("Polska"),
  is_default: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WarehouseInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Jeżeli ustawiamy is_default = true — zdejmij flagę z innych
    if (data.is_default) {
      await context.supabase
        .from("warehouses")
        .update({ is_default: false })
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("warehouses").update(rest).eq("id", id).select().single()
      : context.supabase.from("warehouses").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("warehouses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// System settings
// ================================================================
export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("system_settings")
      .select("*")
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SettingInput = z.object({
  key: z.string().min(1).max(80),
  value: z.any(),
  description: z.string().max(500).nullable().optional(),
});

export const upsertSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("system_settings")
      .upsert({
        key: data.key,
        value: data.value,
        description: data.description ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ================================================================
// Users management (admin-only, uses supabaseAdmin)
// ================================================================
export const listCrmUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersData, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: rolesData } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesData ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    return (usersData?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: rolesByUser.get(u.id) ?? [],
    }));
  });

const RoleEnum = z.enum(["admin", "sales", "warehouse", "transport", "logistyk"]);

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), roles: z.array(RoleEnum) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Zabezpieczenie: nie pozwól odebrać sobie roli admin
    if (data.user_id === context.userId && !data.roles.includes("admin")) {
      throw new Error("Nie można odebrać sobie roli administratora");
    }
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id);
    if (delErr) throw new Error(delErr.message);
    if (data.roles.length > 0) {
      const rows = data.roles.map((role) => ({ user_id: data.user_id, role }));
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true };
  });

export const createCrmUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(120),
        password: z.string().min(8).max(128),
        roles: z.array(RoleEnum).default(["sales"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created.user?.id;
    if (!uid) throw new Error("Nie udało się utworzyć konta");
    // Usuń domyślne role dodane triggerem handle_new_user, wstaw wybrane
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    const rows = data.roles.map((role) => ({ user_id: uid, role }));
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { id: uid, email: data.email };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCrmUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) {
      throw new Error("Nie można usunąć własnego konta");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================================================================
// Check if current user is admin (client helper)
// ================================================================
export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { admin: !!data };
  });
