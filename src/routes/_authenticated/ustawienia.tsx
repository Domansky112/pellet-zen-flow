import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
  Truck, Package2, Users2, Store, Building2, Settings2, Plus, Trash2, Pencil, ShieldAlert, KeyRound, MessageSquare, Copy,
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
  listCrmUsers, createCrmUser, setUserRoles, resetUserPassword, deleteCrmUser,
} from "@/lib/admin.functions";
import { listAllTemplates, upsertTemplate, deleteTemplate, TEMPLATE_VARIABLES } from "@/lib/templates.functions";

const settingsSearchSchema = z.object({
  section: z.enum(["fleet", "users", "products", "warehouses", "carriers", "config", "templates", "statuses"]).optional(),
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
    { value: "products", label: "Słownik produktów", Icon: Package2 },
    { value: "warehouses", label: "Magazyny", Icon: Store },
    { value: "carriers", label: "Przewoźnicy", Icon: Building2 },
    { value: "config", label: "Konfiguracja", Icon: Settings2 },
    { value: "templates", label: "Szablony wiadomości", Icon: MessageSquare },
    { value: "statuses", label: "Statusy leadów", Icon: Settings2 },
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
        {section === "users" && <UsersTab />}
        {section === "products" && <ProductsTab />}
        {section === "warehouses" && <WarehousesTab />}
        {section === "carriers" && <CarriersTab />}
        {section === "config" && <ConfigTab />}
        {section === "templates" && <TemplatesTab />}
        {section === "statuses" && <StatusesTab />}
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
          <VehicleDialog editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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
          <TrailerDialog editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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
          <DriverDialog editing={editing} vehicles={vehicles as any[]} trailers={trailers as any[]} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });

  const [newOpen, setNewOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>(["sales"]);

  const [pwdUser, setPwdUser] = useState<any | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const create = useMutation({
    mutationFn: (p: any) => createFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Utworzono konto"); setNewOpen(false); setNewEmail(""); setNewPass(""); setNewRoles(["sales"]); },
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
              <Button disabled={!newEmail || newPass.length < 8 || create.isPending} onClick={() => create.mutate({ email: newEmail, password: newPass, roles: newRoles })}>
                {create.isPending ? "Tworzenie…" : "Utwórz"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>E-mail</TableHead><TableHead>Role</TableHead><TableHead>Ostatnie logowanie</TableHead><TableHead className="w-32" /></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-6">Ładowanie…</TableCell></TableRow>}
            {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6">Brak użytkowników</TableCell></TableRow>}
            {data.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
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
          <ProductDialog editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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
          <WarehouseDialog editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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
          <CarrierDialog editing={editing} onSave={(p) => save.mutate(p)} pending={save.isPending} />
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

  const [fuelValue, setFuelValue] = useState<string>("");
  const [wzValue, setWzValue] = useState<string>("");

  // hydrate once
  useState(() => {
    if (fuel && fuelValue === "") setFuelValue(String(fuel.value?.pln_per_liter ?? -0.1));
    if (wz && wzValue === "") setWzValue(String(wz.value?.pattern ?? "WZ/{YYYY}/{MM}/{SEQ:0000}"));
  });

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
