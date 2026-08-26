import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Truck, Package2, Users2, LogIn, Store, Building2, Settings2, Plus, Trash2, Pencil, ShieldAlert, KeyRound, MessageSquare, Copy, Wallet, Wrench, Archive, CalendarDays, Handshake,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import {
  isCurrentUserAdmin,
  listVehicles, upsertVehicle, deleteVehicle,
  listTrailers, upsertTrailer, deleteTrailer,
  listDrivers, upsertDriver, deleteDriver,
  listCarriers, upsertCarrier, deleteCarrier,
  listProductDefs, upsertProductDef, deleteProductDef,
  listWarehouses, upsertWarehouse, deleteWarehouse,
  listSettings, upsertSetting,
  listCrmUsers, createCrmUser, setUserRoles, resetUserPassword, deleteCrmUser, impersonateUser,
} from "@/lib/admin.functions";
import { listAllTemplates, upsertTemplate, deleteTemplate, TEMPLATE_VARIABLES } from "@/lib/templates.functions";
import { listLeadStatuses, upsertLeadStatus, deleteLeadStatus } from "@/lib/lead-statuses.functions";
import {
  listFixedAssets, listAssetExpenses, upsertFixedAsset, archiveFixedAsset, deleteFixedAsset,
  ASSET_CATEGORIES, ASSET_STATUSES,
} from "@/lib/assets.functions";
import { EmployeeCalendarTab } from "@/components/employee-calendar";
import { PhysicalWorkersCard } from "@/components/physical-workers-card";
import { AffiliatesTab } from "@/components/affiliates-tab";

const settingsSearchSchema = z.object({
  section: z.enum(["fleet", "users", "products", "warehouses", "carriers", "config", "templates", "statuses", "assets", "employees", "affiliates"]).optional(),
});

export const Route = createFileRoute("/_authenticated/ustawienia")({
  validateSearch: settingsSearchSchema,
  head: () => ({
    meta: [
      { title: "Ustawienia — Słoneczny Pellet OS" },
      { name: "description", content: "Administracja: flota, kierowcy, użytkownicy, słowniki, konfiguracja." },
    ],
  }),
  component: UstawieniaPage,
});

function UstawieniaPage() {
  const checkAdmin = useServerFn(isCurrentUserAdmin);
  const { data: adminCheck, isLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
  });
  const search = useSearch({ from: "/_authenticated/ustawienia" });
  const section = search.section ?? "fleet";

  if (isLoading) {
    return (
      <div className="p-8">
        <PageHeader title="Ustawienia / Administracja" description="Ładowanie…" />
      </div>
    );
  }

  if (!adminCheck?.admin) {
    return (
      <div className="p-8 space-y-4">
        <PageHeader title="Ustawienia / Administracja" description="Panel wymaga uprawnień administratora." />
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Brak uprawnień. Skontaktuj się z administratorem systemu.
          </CardContent>
        </Card>
      </div>
    );
  }

  const SECTION_OPTIONS: { value: string; label: string; Icon: any }[] = [
    { value: "fleet", label: "Flota", Icon: Truck },
    { value: "users", label: "Użytkownicy CRM", Icon: Users2 },
    { value: "employees", label: "Kalendarz pracowniczy", Icon: CalendarDays },
    { value: "products", label: "Słownik produktów", Icon: Package2 },
    { value: "warehouses", label: "Magazyny", Icon: Store },
    { value: "carriers", label: "Przewoźnicy", Icon: Building2 },
    { value: "config", label: "Konfiguracja", Icon: Settings2 },
    { value: "templates", label: "Szablony wiadomości", Icon: MessageSquare },
    { value: "statuses", label: "Statusy leadów", Icon: Settings2 },
    { value: "assets", label: "Środki trwałe", Icon: Wrench },
    { value: "affiliates", label: "Afiliacje", Icon: Handshake },
  ];
  const current = SECTION_OPTIONS.find((s) => s.value === section) ?? SECTION_OPTIONS[0];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        title={`Ustawienia / ${current.label}`}
        description="Zarządzanie flotą, kierowcami, kontami CRM, słownikami magazynowymi i konfiguracją globalną."
      />
      <div className="pt-2">
        {section === "fleet" && <FleetTab />}
        {section === "users" && (
          <div className="space-y-6">
            <UsersTab />
            <PhysicalWorkersCard />
          </div>
        )}
        {section === "employees" && <EmployeeCalendarTab />}
        {section === "products" && <ProductsTab />}
        {section === "warehouses" && <WarehousesTab />}
        {section === "carriers" && <CarriersTab />}
        {section === "config" && <ConfigTab />}
        {section === "templates" && <TemplatesTab />}
        {section === "statuses" && <StatusesTab />}
        {section === "assets" && <AssetsTab />}
        {section === "affiliates" && <AffiliatesTab />}

      </div>
    </div>
  );
}

// ============================================================
// FLEET TAB (Vehicles + Trailers + Drivers)
// ============================================================
function FleetTab() {
  return (
    <div className="grid gap-6">
      <VehiclesSection />
      <TrailersSection />
      <DriversSection />
    </div>
  );
}

function VehiclesSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listVehicles);
  const upsertFn = useServerFn(upsertVehicle);
  const delFn = useServerFn(deleteVehicle);
  const { data = [] } = useQuery({ queryKey: ["admin-vehicles"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (payload: any) => upsertFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vehicles"] }); toast.success("Zapisano pojazd"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-vehicles"] }); toast.success("Usunięto pojazd"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Pojazdy / Ciągniki</CardTitle>
          <CardDescription>Rejestracja, marka, ładowność, status.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj pojazd</Button></DialogTrigger>
          <VehicleDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nr rej.</TableHead>
              <TableHead>Marka / Model</TableHead>
              <TableHead>Ładowność [t]</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Brak pojazdów</TableCell></TableRow>}
            {data.map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono">{v.registration}</TableCell>
                <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell>{v.capacity_tons ?? "—"}</TableCell>
                <TableCell><StatusBadge status={v.status} /></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(v); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć pojazd ${v.registration}?`)) del.mutate(v.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function VehicleDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, registration: editing?.registration ?? "", brand: editing?.brand ?? "",
    model: editing?.model ?? "", capacity_tons: editing?.capacity_tons ?? null,
    status: editing?.status ?? "aktywny", notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj pojazd" : "Nowy pojazd"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Numer rejestracyjny *</Label><Input value={f.registration} onChange={(e) => setF({ ...f, registration: e.target.value.toUpperCase() })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Marka</Label><Input value={f.brand ?? ""} onChange={(e) => setF({ ...f, brand: e.target.value })} /></div>
          <div><Label>Model</Label><Input value={f.model ?? ""} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Ładowność [t]</Label><Input type="number" step="0.1" value={f.capacity_tons ?? ""} onChange={(e) => setF({ ...f, capacity_tons: e.target.value ? Number(e.target.value) : null })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="aktywny">Aktywny</SelectItem><SelectItem value="serwis">Serwis</SelectItem><SelectItem value="wycofany">Wycofany</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.registration} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

function TrailersSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrailers);
  const upsertFn = useServerFn(upsertTrailer);
  const delFn = useServerFn(deleteTrailer);
  const { data = [] } = useQuery({ queryKey: ["admin-trailers"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-trailers"] }); toast.success("Zapisano naczepę"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-trailers"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Naczepy</CardTitle>
          <CardDescription>Rejestracja, typ, ładowność.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj naczepę</Button></DialogTrigger>
          <TrailerDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Nr rej.</TableHead><TableHead>Typ</TableHead><TableHead>Ładowność [t]</TableHead><TableHead>Status</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Brak naczep</TableCell></TableRow>}
            {data.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono">{t.registration}</TableCell>
                <TableCell>{t.trailer_type ?? "—"}</TableCell>
                <TableCell>{t.capacity_tons ?? "—"}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć naczepę ${t.registration}?`)) del.mutate(t.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TrailerDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, registration: editing?.registration ?? "", trailer_type: editing?.trailer_type ?? "",
    capacity_tons: editing?.capacity_tons ?? null, status: editing?.status ?? "aktywny", notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj naczepę" : "Nowa naczepa"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Numer rejestracyjny *</Label><Input value={f.registration} onChange={(e) => setF({ ...f, registration: e.target.value.toUpperCase() })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Typ</Label><Input value={f.trailer_type ?? ""} placeholder="kurtyna / plandeka…" onChange={(e) => setF({ ...f, trailer_type: e.target.value })} /></div>
          <div><Label>Ładowność [t]</Label><Input type="number" step="0.1" value={f.capacity_tons ?? ""} onChange={(e) => setF({ ...f, capacity_tons: e.target.value ? Number(e.target.value) : null })} /></div>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="aktywny">Aktywny</SelectItem><SelectItem value="serwis">Serwis</SelectItem><SelectItem value="wycofany">Wycofany</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.registration} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

function DriversSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDrivers);
  const vehiclesFn = useServerFn(listVehicles);
  const trailersFn = useServerFn(listTrailers);
  const upsertFn = useServerFn(upsertDriver);
  const delFn = useServerFn(deleteDriver);
  const { data = [] } = useQuery({ queryKey: ["admin-drivers"], queryFn: () => listFn() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["admin-vehicles"], queryFn: () => vehiclesFn() });
  const { data: trailers = [] } = useQuery({ queryKey: ["admin-trailers"], queryFn: () => trailersFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-drivers"] }); toast.success("Zapisano kierowcę"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-drivers"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Kierowcy</CardTitle>
          <CardDescription>Imię, nazwisko, telefon, przypisany pojazd i naczepa.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj kierowcę</Button></DialogTrigger>
          <DriverDialog key={editing?.id ?? "new"} editing={editing} vehicles={vehicles as any[]} trailers={trailers as any[]} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Imię i nazwisko</TableHead><TableHead>Telefon</TableHead><TableHead>Pojazd</TableHead><TableHead>Naczepa</TableHead><TableHead>Status</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Brak kierowców</TableCell></TableRow>}
            {data.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.first_name} {d.last_name}</TableCell>
                <TableCell>{d.phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{d.vehicle?.registration ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{d.trailer?.registration ?? "—"}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć kierowcę ${d.first_name} ${d.last_name}?`)) del.mutate(d.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DriverDialog({ editing, vehicles, trailers, onSave, pending }: { editing: any | null; vehicles: any[]; trailers: any[]; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, first_name: editing?.first_name ?? "", last_name: editing?.last_name ?? "",
    phone: editing?.phone ?? "", email: editing?.email ?? "",
    vehicle_id: editing?.vehicle_id ?? null, trailer_id: editing?.trailer_id ?? null,
    status: editing?.status ?? "aktywny", notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj kierowcę" : "Nowy kierowca"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Imię *</Label><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
          <div><Label>Nazwisko *</Label><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Telefon</Label><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>E-mail</Label><Input type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Pojazd</Label>
            <Select value={f.vehicle_id ?? "none"} onValueChange={(v) => setF({ ...f, vehicle_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Brak" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— brak —</SelectItem>
                {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.registration} {v.brand ?? ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Naczepa</Label>
            <Select value={f.trailer_id ?? "none"} onValueChange={(v) => setF({ ...f, trailer_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Brak" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— brak —</SelectItem>
                {trailers.map((t) => <SelectItem key={t.id} value={t.id}>{t.registration} {t.trailer_type ?? ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="aktywny">Aktywny</SelectItem><SelectItem value="urlop">Urlop</SelectItem><SelectItem value="nieaktywny">Nieaktywny</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.first_name || !f.last_name} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// USERS TAB
// ============================================================
const ALL_ROLES = ["admin", "sales", "warehouse", "transport", "logistyk"] as const;
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator", sales: "Handlowiec", warehouse: "Magazynier",
  transport: "Transport", logistyk: "Logistyk",
};

function UsersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCrmUsers);
  const createFn = useServerFn(createCrmUser);
  const setRolesFn = useServerFn(setUserRoles);
  const resetFn = useServerFn(resetUserPassword);
  const delFn = useServerFn(deleteCrmUser);
  const impersonateFn = useServerFn(impersonateUser);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });

  const impersonate = useMutation({
    mutationFn: async (user_id: string) => {
      const res = await impersonateFn({ data: { user_id } });
      await qc.cancelQueries();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: res.token_hash,
      });
      if (error) throw new Error(error.message);
      return res;
    },
    onSuccess: (res) => {
      qc.clear();
      toast.success(`Zalogowano jako ${res.email}`);
      window.location.href = "/dashboard";
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [newOpen, setNewOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>(["sales"]);

  const [pwdUser, setPwdUser] = useState<any | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const create = useMutation({
    mutationFn: (p: any) => createFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Utworzono konto"); setNewOpen(false); setNewEmail(""); setNewName(""); setNewPass(""); setNewRoles(["sales"]); },
    onError: (e: any) => toast.error(e.message),
  });
  const setRoles = useMutation({
    mutationFn: (p: { user_id: string; roles: any[] }) => setRolesFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Zaktualizowano role"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: (p: any) => resetFn({ data: p }),
    onSuccess: () => { toast.success("Hasło zmienione"); setPwdUser(null); setNewPwd(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (user_id: string) => delFn({ data: { user_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Usunięto konto"); },
    onError: (e: any) => toast.error(e.message),
  });

  function toggleRole(roles: string[], role: string) {
    return roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Users2 className="h-5 w-5" /> Konta CRM</CardTitle>
          <CardDescription>Dodawanie kont, resetowanie haseł, zarządzanie rolami.</CardDescription>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj użytkownika</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nowe konto CRM</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Imię i nazwisko</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div><Label>E-mail</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
              <div><Label>Hasło (min. 8 znaków)</Label><Input type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} /></div>
              <div>
                <Label>Role</Label>
                <div className="flex flex-wrap gap-3 pt-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={newRoles.includes(r)} onCheckedChange={() => setNewRoles(toggleRole(newRoles, r))} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!newEmail || newPass.length < 8 || create.isPending} onClick={() => create.mutate({ email: newEmail, password: newPass, full_name: newName || null, roles: newRoles })}>
                {create.isPending ? "Tworzenie…" : "Utwórz"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Użytkownik</TableHead><TableHead>Role</TableHead><TableHead>Ostatnie logowanie</TableHead><TableHead className="w-32" /></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-6">Ładowanie…</TableCell></TableRow>}
            {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6">Brak użytkowników</TableCell></TableRow>}
            {data.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.full_name ? <div>{u.full_name}</div> : null}
                  <div className={u.full_name ? "text-xs text-muted-foreground" : ""}>{u.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {ALL_ROLES.map((r) => (
                      <label key={r} className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={u.roles.includes(r)}
                          onCheckedChange={() => setRoles.mutate({ user_id: u.id, roles: toggleRole(u.roles, r) as any })}
                        />
                        {ROLE_LABEL[r]}
                      </label>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pl-PL") : "—"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={impersonate.isPending}
                    onClick={() => {
                      if (confirm(`Zalogować się jako ${u.email}? Twoja sesja administratora zostanie zamknięta.`))
                        impersonate.mutate(u.id);
                    }}
                  >
                    <LogIn className="h-4 w-4 mr-1" /> Zaloguj jako
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setPwdUser(u)}><KeyRound className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć konto ${u.email}?`)) del.mutate(u.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>

              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Dialog open={!!pwdUser} onOpenChange={(v) => { if (!v) { setPwdUser(null); setNewPwd(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Zmiana hasła — {pwdUser?.email}</DialogTitle></DialogHeader>
            <div><Label>Nowe hasło (min. 8 znaków)</Label><Input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
            <DialogFooter>
              <Button disabled={newPwd.length < 8 || reset.isPending} onClick={() => reset.mutate({ user_id: pwdUser.id, password: newPwd })}>
                {reset.isPending ? "Zapisywanie…" : "Zmień hasło"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ============================================================
// PRODUCTS TAB
// ============================================================
function ProductsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductDefs);
  const upsertFn = useServerFn(upsertProductDef);
  const delFn = useServerFn(deleteProductDef);
  const { data = [] } = useQuery({ queryKey: ["admin-products"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-products"] }); toast.success("Zapisano"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-products"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Package2 className="h-5 w-5" /> Słownik produktów</CardTitle>
          <CardDescription>Warianty pelletu i pakowania używane w leadach i na magazynie.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj produkt</Button></DialogTrigger>
          <ProductDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Kod</TableHead><TableHead>Etykieta</TableHead><TableHead>Pakowanie</TableHead><TableHead>Waga jedn. [kg]</TableHead><TableHead>Aktywny</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6">Brak produktów</TableCell></TableRow>}
            {data.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell>{p.packaging ?? "—"}</TableCell>
                <TableCell>{p.unit_weight_kg ?? "—"}</TableCell>
                <TableCell>{p.active ? <Badge>tak</Badge> : <Badge variant="secondary">nie</Badge>}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć produkt ${p.label}?`)) del.mutate(p.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProductDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, code: editing?.code ?? "", label: editing?.label ?? "",
    packaging: editing?.packaging ?? "big_bag", unit_weight_kg: editing?.unit_weight_kg ?? null,
    active: editing?.active ?? true, notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj produkt" : "Nowy produkt"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Kod *</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={!!editing} /></div>
          <div>
            <Label>Pakowanie</Label>
            <Select value={f.packaging ?? "big_bag"} onValueChange={(v) => setF({ ...f, packaging: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="big_bag">Big-Bag</SelectItem>
                <SelectItem value="paleta">Paleta</SelectItem>
                <SelectItem value="luz">Luz</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Etykieta *</Label><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Waga jedn. [kg]</Label><Input type="number" value={f.unit_weight_kg ?? ""} onChange={(e) => setF({ ...f, unit_weight_kg: e.target.value ? Number(e.target.value) : null })} /></div>
          <label className="flex items-end gap-2 pb-2"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} /> Aktywny</label>
        </div>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.code || !f.label} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// WAREHOUSES TAB
// ============================================================
function WarehousesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWarehouses);
  const upsertFn = useServerFn(upsertWarehouse);
  const delFn = useServerFn(deleteWarehouse);
  const { data = [] } = useQuery({ queryKey: ["admin-warehouses"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-warehouses"] }); toast.success("Zapisano"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-warehouses"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Magazyny (miejsca załadunku)</CardTitle>
          <CardDescription>Adresy używane w dokumentach WZ i transporcie.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj magazyn</Button></DialogTrigger>
          <WarehouseDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Nazwa</TableHead><TableHead>Adres</TableHead><TableHead>Domyślny</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6">Brak magazynów</TableCell></TableRow>}
            {data.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="text-sm">{[w.address_line, w.postal_code, w.city].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell>{w.is_default ? <Badge>domyślny</Badge> : "—"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(w); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć magazyn ${w.name}?`)) del.mutate(w.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WarehouseDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, name: editing?.name ?? "", address_line: editing?.address_line ?? "",
    postal_code: editing?.postal_code ?? "", city: editing?.city ?? "", country: editing?.country ?? "Polska",
    is_default: editing?.is_default ?? false, notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj magazyn" : "Nowy magazyn"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Nazwa *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Adres</Label><Input value={f.address_line ?? ""} onChange={(e) => setF({ ...f, address_line: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Kod pocztowy</Label><Input value={f.postal_code ?? ""} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></div>
          <div><Label>Miejscowość</Label><Input value={f.city ?? ""} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div><Label>Kraj</Label><Input value={f.country ?? "Polska"} onChange={(e) => setF({ ...f, country: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2"><Checkbox checked={f.is_default} onCheckedChange={(v) => setF({ ...f, is_default: !!v })} /> Ustaw jako domyślny magazyn</label>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.name} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// CARRIERS TAB
// ============================================================
function CarriersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCarriers);
  const upsertFn = useServerFn(upsertCarrier);
  const delFn = useServerFn(deleteCarrier);
  const { data = [] } = useQuery({ queryKey: ["admin-carriers"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-carriers"] }); toast.success("Zapisano"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-carriers"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Zewnętrzni przewoźnicy</CardTitle>
          <CardDescription>Baza firm transportowych zlecanych na zewnątrz.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj przewoźnika</Button></DialogTrigger>
          <CarrierDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Firma</TableHead><TableHead>NIP</TableHead><TableHead>Kontakt</TableHead><TableHead>Telefon</TableHead><TableHead>Stawka [zł/km]</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6">Brak przewoźników</TableCell></TableRow>}
            {data.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.company_name}</TableCell>
                <TableCell className="font-mono text-xs">{c.nip ?? "—"}</TableCell>
                <TableCell>{c.contact_person ?? "—"}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>{c.base_rate_per_km ?? "—"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć przewoźnika ${c.company_name}?`)) del.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CarrierDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id, company_name: editing?.company_name ?? "", nip: editing?.nip ?? "",
    contact_person: editing?.contact_person ?? "", phone: editing?.phone ?? "", email: editing?.email ?? "",
    base_rate_per_km: editing?.base_rate_per_km ?? null, status: editing?.status ?? "aktywny", notes: editing?.notes ?? "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edytuj przewoźnika" : "Nowy przewoźnik"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Nazwa firmy *</Label><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>NIP</Label><Input value={f.nip ?? ""} onChange={(e) => setF({ ...f, nip: e.target.value })} /></div>
          <div><Label>Osoba kontaktowa</Label><Input value={f.contact_person ?? ""} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Telefon</Label><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>E-mail</Label><Input type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Stawka [zł/km]</Label><Input type="number" step="0.01" value={f.base_rate_per_km ?? ""} onChange={(e) => setF({ ...f, base_rate_per_km: e.target.value ? Number(e.target.value) : null })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="aktywny">Aktywny</SelectItem><SelectItem value="nieaktywny">Nieaktywny</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Notatka</Label><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={pending || !f.company_name} onClick={() => onSave(f)}>{pending ? "Zapisywanie…" : "Zapisz"}</Button></DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// CONFIG TAB
// ============================================================
function ConfigTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSettings);
  const upsertFn = useServerFn(upsertSetting);
  const { data = [] } = useQuery({ queryKey: ["admin-settings"], queryFn: () => listFn() });

  const fuel = (data as any[]).find((s) => s.key === "fuel_price_correction");
  const wz = (data as any[]).find((s) => s.key === "wz_number_format");
  const unitCost = (data as any[]).find((s) => s.key === "pellet_unit_cost_pln");

  const [fuelValue, setFuelValue] = useState<string>("");
  const [wzValue, setWzValue] = useState<string>("");
  const [unitCostValue, setUnitCostValue] = useState<string>("");
  const [unitCostVat, setUnitCostVat] = useState<string>(String(unitCost?.value?.vat_rate ?? 8));

  // hydrate once
  useState(() => {
    if (fuel && fuelValue === "") setFuelValue(String(fuel.value?.pln_per_liter ?? -0.1));
    if (wz && wzValue === "") setWzValue(String(wz.value?.pattern ?? "WZ/{YYYY}/{MM}/{SEQ:0000}"));
    if (unitCost && unitCostValue === "") setUnitCostValue(String(unitCost.value?.pln_per_ton ?? 0));
  });

  useEffect(() => {
    if (unitCost?.value?.vat_rate != null) setUnitCostVat(String(unitCost.value.vat_rate));
  }, [unitCost?.value?.vat_rate]);


  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-settings"] }); toast.success("Zapisano ustawienie"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Reguła ceny paliwa</CardTitle>
          <CardDescription>Korekta względem detalicznej ceny Orlen (zł/l). Wartość ujemna = tańsze niż detal.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <Label>Korekta [zł/l]</Label>
            <Input
              type="number" step="0.01"
              defaultValue={String(fuel?.value?.pln_per_liter ?? -0.1)}
              onChange={(e) => setFuelValue(e.target.value)}
            />
          </div>
          <Button
            onClick={() => save.mutate({
              key: "fuel_price_correction",
              value: { pln_per_liter: Number(fuelValue || fuel?.value?.pln_per_liter || -0.1) },
              description: "Korekta ceny paliwa względem detalicznej ceny Orlen (zł/l).",
            })}
          >Zapisz</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wzorzec numeracji WZ</CardTitle>
          <CardDescription>Placeholdery: <code>{"{YYYY}"}</code>, <code>{"{MM}"}</code>, <code>{"{DD}"}</code>, <code>{"{SEQ:0000}"}</code>.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1 max-w-md">
            <Label>Wzorzec</Label>
            <Input
              defaultValue={String(wz?.value?.pattern ?? "WZ/{YYYY}/{MM}/{SEQ:0000}")}
              onChange={(e) => setWzValue(e.target.value)}
            />
          </div>
          <Button
            onClick={() => save.mutate({
              key: "wz_number_format",
              value: { pattern: wzValue || wz?.value?.pattern || "WZ/{YYYY}/{MM}/{SEQ:0000}" },
              description: "Wzorzec numeracji dokumentów WZ.",
            })}
          >Zapisz</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Koszt jednostkowy pelletu</CardTitle>
          <CardDescription>Cena kosztowa 1 tony pelletu (PLN, brutto) oraz jej stawka VAT. Używana do wyceny magazynu i kosztu surowca (COGS) w module Płatności.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px] max-w-xs">
            <Label>Cena [PLN / tona] (brutto)</Label>
            <Input
              type="number" step="1" min="0"
              defaultValue={String(unitCost?.value?.pln_per_ton ?? 0)}
              onChange={(e) => setUnitCostValue(e.target.value)}
            />
          </div>
          <div className="min-w-[180px]">
            <Label>Stawka VAT surowca</Label>
            <Select value={unitCostVat} onValueChange={setUnitCostVat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8% (domyślna — biomasa / opał)</SelectItem>
                <SelectItem value="23">23%</SelectItem>
                <SelectItem value="0">zw / 0%</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Netto: {(Number(unitCostValue || unitCost?.value?.pln_per_ton || 0) / (1 + Number(unitCostVat) / 100)).toFixed(2)} zł/t
            </p>
          </div>
          <Button
            onClick={() => save.mutate({
              key: "pellet_unit_cost_pln",
              value: {
                pln_per_ton: Number(unitCostValue || unitCost?.value?.pln_per_ton || 0),
                vat_rate: Number(unitCostVat),
              },
              description: "Koszt jednostkowy 1 tony pelletu w PLN (brutto) wraz ze stawką VAT — wycena magazynu i COGS.",
            })}
          >Zapisz</Button>
        </CardContent>
      </Card>
    </div>
  );
}


// ============================================================
// Small helpers
// ============================================================
function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    aktywny: "default", serwis: "outline", wycofany: "secondary",
    urlop: "outline", nieaktywny: "secondary",
  };
  return <Badge variant={variant[status] ?? "outline"}>{status}</Badge>;
}

// ============================================================
// TEMPLATES TAB
// ============================================================
type TemplateRow = {
  id: string;
  name: string;
  product: string | null;
  subject: string | null;
  body: string;
  channel: "email" | "sms";
  is_active: boolean;
};

function TemplatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllTemplates);
  const upsertFn = useServerFn(upsertTemplate);
  const delFn = useServerFn(deleteTemplate);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-templates"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const saveM = useMutation({
    mutationFn: (payload: any) => upsertFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Zapisano szablon");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Usunięto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Szablony wiadomości / ofert</CardTitle>
          <CardDescription>Zdefiniuj szablony e-mail/SMS z dynamicznymi zmiennymi. Aktywne szablony pojawią się w panelu leada.</CardDescription>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nowy szablon
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Brak szablonów. Utwórz pierwszy, aby handlowcy mogli z niego korzystać.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Kanał</TableHead>
                <TableHead>Produkt</TableHead>
                <TableHead>Temat</TableHead>
                <TableHead>Aktywny</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((raw) => { const t = raw as TemplateRow; return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.channel}</Badge></TableCell>
                  <TableCell>{t.product ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{t.subject ?? "—"}</TableCell>
                  <TableCell>{t.is_active ? <Badge>aktywny</Badge> : <Badge variant="secondary">wyłączony</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć szablon „${t.name}"?`)) deleteM.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ); })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <TemplateDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSave={(p) => saveM.mutate(p)}
        saving={saveM.isPending}
      />
    </Card>
  );
}

function TemplateDialog({
  open, onOpenChange, editing, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TemplateRow | null;
  onSave: (payload: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [product, setProduct] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);

  useState(() => {
    if (editing) {
      setName(editing.name);
      setChannel(editing.channel);
      setProduct(editing.product ?? "");
      setSubject(editing.subject ?? "");
      setBody(editing.body);
      setIsActive(editing.is_active);
    }
    return 0;
  });

  // reset on open change
  const openKey = open ? (editing?.id ?? "new") : "closed";
  const [lastKey, setLastKey] = useState<string>("");
  if (lastKey !== openKey) {
    setLastKey(openKey);
    if (open) {
      setName(editing?.name ?? "");
      setChannel(editing?.channel ?? "email");
      setProduct(editing?.product ?? "");
      setSubject(editing?.subject ?? "");
      setBody(editing?.body ?? "");
      setIsActive(editing?.is_active ?? true);
    }
  }

  const insertVar = (key: string) => {
    setBody((b) => `${b}${b && !b.endsWith(" ") && !b.endsWith("\n") ? " " : ""}{{${key}}}`);
  };
  const copyVar = (key: string) => {
    navigator.clipboard.writeText(`{{${key}}}`);
    toast.success(`Skopiowano {{${key}}}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edytuj szablon" : "Nowy szablon"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nazwa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oferta standardowa – Pellet…" />
              </div>
              <div className="space-y-1">
                <Label>Kanał</Label>
                <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Produkt (opcjonalnie)</Label>
                <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="np. Pellet paleta" />
              </div>
              <div className="space-y-1 flex flex-col justify-end">
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} id="tpl-active" />
                  <Label htmlFor="tpl-active">Aktywny (widoczny dla handlowców)</Label>
                </div>
              </div>
            </div>
            {channel === "email" && (
              <div className="space-y-1">
                <Label>Temat wiadomości</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oferta pelletu dla {{imie_klienta}}" />
              </div>
            )}
            <div className="space-y-1">
              <Label>Treść</Label>
              <Textarea
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Dzień dobry {{imie_klienta}},\n\nprzesyłam ofertę na {{tonaz}} t {{rodzaj_pelletu}} z dostawą pod adres {{adres_dostawy}}.\nKoszt transportu: {{cena_transportu}} zł.\n\nPozdrawiam,\n{{imie_handlowca}}"}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <aside className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="font-medium text-sm">Dostępne zmienne</div>
            <div className="text-muted-foreground">Kliknij, aby wstawić do treści.</div>
            <div className="space-y-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <div key={v.key} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                  <button className="flex-1 text-left" type="button" onClick={() => insertVar(v.key)}>
                    <div className="font-mono">{`{{${v.key}}}`}</div>
                    <div className="text-[10px] text-muted-foreground">{v.description}</div>
                  </button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyVar(v.key)} type="button">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </aside>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button
            disabled={saving || !name.trim() || !body.trim()}
            onClick={() => onSave({
              id: editing?.id,
              name: name.trim(),
              product: product.trim() || null,
              subject: subject.trim() || null,
              body,
              channel,
              is_active: isActive,
            })}
          >Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// STATUSES TAB — dictionary of lead statuses
// ============================================================
function StatusesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadStatuses);
  const upsertFn = useServerFn(upsertLeadStatus);
  const delFn = useServerFn(deleteLeadStatus);

  const { data = [], isLoading } = useQuery({
    queryKey: ["lead-statuses"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<null | {
    key: string;
    label: string;
    color: string;
    sort_order: number;
    is_active: boolean;
    isNew: boolean;
  }>(null);

  const save = useMutation({
    mutationFn: async (v: { key: string; label: string; color: string; sort_order: number; is_active: boolean }) =>
      upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Zapisano");
      qc.invalidateQueries({ queryKey: ["lead-statuses"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (key: string) => delFn({ data: { key } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["lead-statuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Statusy leadów</CardTitle>
          <CardDescription>
            Słownik statusów widocznych w CRM. Statusy systemowe są używane przez logikę magazynową i nie można ich usunąć.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() =>
            setEditing({ key: "", label: "", color: "#64748b", sort_order: (data.length + 1) * 10, is_active: true, isNew: true })
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Dodaj status
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Etykieta</TableHead>
                <TableHead>Klucz</TableHead>
                <TableHead>Kolejność</TableHead>
                <TableHead>Aktywny</TableHead>
                <TableHead className="w-[160px] text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>
                    <span
                      className="inline-block h-4 w-4 rounded-full border"
                      style={{ backgroundColor: s.color }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {s.label}{" "}
                    {s.is_system && (
                      <Badge variant="outline" className="ml-1 text-[10px]">system</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.key}</TableCell>
                  <TableCell>{s.sort_order}</TableCell>
                  <TableCell>{s.is_active ? "Tak" : "Nie"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          key: s.key,
                          label: s.label,
                          color: s.color,
                          sort_order: s.sort_order,
                          is_active: s.is_active,
                          isNew: false,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={s.is_system}
                      onClick={() => {
                        if (confirm(`Usunąć status „${s.label}"?`)) del.mutate(s.key);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? "Nowy status" : "Edytuj status"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Etykieta</Label>
                <Input
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="np. Oferta wysłana"
                />
              </div>
              <div>
                <Label>Klucz (małe litery, cyfry, _)</Label>
                <Input
                  value={editing.key}
                  disabled={!editing.isNew}
                  onChange={(e) => setEditing({ ...editing, key: e.target.value.toLowerCase() })}
                  placeholder="np. oferta_wyslana"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kolor</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-9 w-16 p-1"
                      value={editing.color}
                      onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    />
                    <Input
                      value={editing.color}
                      onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Kolejność</Label>
                  <Input
                    type="number"
                    value={editing.sort_order}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Aktywny (widoczny w wyborze)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Anuluj</Button>
            <Button
              onClick={() => {
                if (!editing) return;
                save.mutate({
                  key: editing.key,
                  label: editing.label,
                  color: editing.color,
                  sort_order: editing.sort_order,
                  is_active: editing.is_active,
                });
              }}
              disabled={!editing?.label || !editing?.key || !/^#[0-9a-fA-F]{6}$/.test(editing?.color ?? "")}
            >
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// ŚRODKI TRWAŁE
// ============================================================
const fmtPLNa = (n: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n || 0);

function AssetsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFixedAssets);
  const upsertFn = useServerFn(upsertFixedAsset);
  const archiveFn = useServerFn(archiveFixedAsset);
  const delFn = useServerFn(deleteFixedAsset);

  const [showArchived, setShowArchived] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["fixed-assets", showArchived],
    queryFn: () => listFn({ data: { includeArchived: showArchived } }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (p: any) => upsertFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("Zapisano środek trwały"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (p: { id: string; restore?: boolean }) => archiveFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("Zaktualizowano"); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("Usunięto"); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalValue = data.reduce((s: number, a: any) => s + Number(a.purchase_value ?? 0), 0);
  const totalCosts = data.reduce((s: number, a: any) => s + Number(a.expenses_total ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Środki trwałe</CardTitle>
          <CardDescription>
            Pojazdy, maszyny i sprzęt magazynowy. Wartość początkowa: {fmtPLNa(totalValue)} · koszty eksploatacji: {fmtPLNa(totalCosts)}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Pokaż zarchiwizowane
          </label>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Dodaj środek trwały</Button></DialogTrigger>
            <AssetDialog key={editing?.id ?? "new"} editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Kategoria</TableHead>
              <TableHead>Nr rej. / seryjny</TableHead>
              <TableHead>Wartość zakupu</TableHead>
              <TableHead>Następny przegląd</TableHead>
              <TableHead>Koszty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Brak środków trwałych</TableCell></TableRow>}
            {data.map((a: any) => {
              const soon = a.next_service_date && new Date(a.next_service_date).getTime() < Date.now() + 30 * 864e5;
              return (
                <TableRow key={a.id} className={a.archived_at ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    <button className="hover:underline text-left" onClick={() => setDetail(a)}>{a.name}</button>
                  </TableCell>
                  <TableCell>{ASSET_CATEGORIES.find((c) => c.value === a.category)?.label ?? a.category}</TableCell>
                  <TableCell className="font-mono text-xs">{a.identifier || "—"}</TableCell>
                  <TableCell>{a.purchase_value != null ? fmtPLNa(Number(a.purchase_value)) : "—"}</TableCell>
                  <TableCell className={soon ? "text-destructive font-medium" : ""}>{a.next_service_date || "—"}</TableCell>
                  <TableCell className="text-amber-600 dark:text-amber-400">{fmtPLNa(Number(a.expenses_total ?? 0))}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ASSET_STATUSES.find((s) => s.value === a.status)?.label ?? a.status}</Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title={a.archived_at ? "Przywróć" : "Archiwizuj"} onClick={() => archive.mutate({ id: a.id, restore: !!a.archived_at })}><Archive className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Usunąć trwale „${a.name}”?`)) del.mutate(a.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        {detail && <AssetDetailDialog asset={detail} />}
      </Dialog>
    </Card>
  );
}

function AssetDialog({ editing, onSave, pending }: { editing: any | null; onSave: (p: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    id: editing?.id,
    name: editing?.name ?? "",
    category: editing?.category ?? "inne",
    identifier: editing?.identifier ?? "",
    purchase_value: editing?.purchase_value ?? "",
    purchase_date: editing?.purchase_date ?? "",
    next_service_date: editing?.next_service_date ?? "",
    status: editing?.status ?? "sprawny",
    notes: editing?.notes ?? "",
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{editing ? "Edytuj środek trwały" : "Nowy środek trwały"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Nazwa *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="np. Ciężarówka dostawcza MAN" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kategoria</Label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Nr rejestracyjny / seryjny</Label><Input value={f.identifier ?? ""} onChange={(e) => setF({ ...f, identifier: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Wartość zakupu [PLN]</Label><Input inputMode="decimal" value={f.purchase_value ?? ""} onChange={(e) => setF({ ...f, purchase_value: e.target.value })} /></div>
          <div><Label>Data zakupu</Label><Input type="date" value={f.purchase_date ?? ""} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Następny przegląd / OC-AC</Label><Input type="date" value={f.next_service_date ?? ""} onChange={(e) => setF({ ...f, next_service_date: e.target.value })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Uwagi / opis techniczny</Label><Textarea rows={3} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button
          disabled={pending || !f.name.trim()}
          onClick={() => onSave({
            ...f,
            identifier: f.identifier || null,
            purchase_value: f.purchase_value === "" ? null : f.purchase_value,
            purchase_date: f.purchase_date || null,
            next_service_date: f.next_service_date || null,
            notes: f.notes || null,
          })}
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AssetDetailDialog({ asset }: { asset: any }) {
  const listFn = useServerFn(listAssetExpenses);
  const { data = [] } = useQuery({ queryKey: ["asset-expenses", asset.id], queryFn: () => listFn({ data: { assetId: asset.id } }) });
  const total = data.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> {asset.name}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-muted-foreground">Kategoria: </span>{ASSET_CATEGORIES.find((c) => c.value === asset.category)?.label ?? asset.category}</div>
        <div><span className="text-muted-foreground">Nr: </span>{asset.identifier || "—"}</div>
        <div><span className="text-muted-foreground">Wartość zakupu: </span>{asset.purchase_value != null ? fmtPLNa(Number(asset.purchase_value)) : "—"}</div>
        <div><span className="text-muted-foreground">Data zakupu: </span>{asset.purchase_date || "—"}</div>
        <div><span className="text-muted-foreground">Następny przegląd: </span>{asset.next_service_date || "—"}</div>
        <div><span className="text-muted-foreground">Status: </span>{ASSET_STATUSES.find((s) => s.value === asset.status)?.label ?? asset.status}</div>
      </div>
      {asset.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3">{asset.notes}</p>}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium text-sm">Koszty eksploatacji i serwisu</div>
          <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtPLNa(total)}</div>
        </div>
        {data.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Brak przypisanych kosztów.</div>}
        <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
          {data.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate">{e.description}</div>
                <div className="text-xs text-muted-foreground">{e.expense_date} · {e.category}</div>
              </div>
              <div className="font-medium text-amber-600 dark:text-amber-400">−{fmtPLNa(Number(e.amount))}</div>
            </div>
          ))}
        </div>
      </div>
    </DialogContent>
  );
}
