import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Github } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BackupRow = { id: string; created_at: string; kind: string; size_bytes: number | null; tables_count: number | null };

function fmtSize(b: number | null) {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function downloadBackup(id: string, createdAt: string) {
  const { data, error } = await supabase.from("backups").select("data").eq("id", id).single();
  if (error) throw new Error(error.message);
  const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(createdAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `kopia-zapasowa-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupsTab() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backups")
        .select("id, created_at, kind, size_bytes, tables_count")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as BackupRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_backup", { _kind: "manual" });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["backups"] });
      await downloadBackup(id, new Date().toISOString());
      toast.success("Kopia utworzona i pobrana");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backups").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Kopie zapasowe danych</CardTitle>
            <CardDescription>
              Automatyczna kopia tworzy się w każdy piątek o 3:00. Przechowywanych jest 12 ostatnich kopii.
            </CardDescription>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {create.isPending ? "Tworzenie…" : "Utwórz i pobierz teraz"}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Rodzaj</TableHead>
                <TableHead>Tabele</TableHead>
                <TableHead>Rozmiar</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Ładowanie…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Brak kopii — utwórz pierwszą.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString("pl-PL")}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "weekly" ? "secondary" : "outline"}>
                      {r.kind === "weekly" ? "Cotygodniowa" : "Ręczna"}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.tables_count ?? "—"}</TableCell>
                  <TableCell>{fmtSize(r.size_bytes)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={async () => {
                        setBusyId(r.id);
                        try { await downloadBackup(r.id, r.created_at); }
                        catch (e) { toast.error((e as Error).message); }
                        finally { setBusyId(null); }
                      }}
                    >
                      <Download className="mr-1 h-4 w-4" /> Pobierz
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { if (confirm("Usunąć tę kopię?")) remove.mutate(r.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Github className="h-5 w-5" /> Kod aplikacji</CardTitle>
          <CardDescription>
            Kod aplikacji zapisuje się przez połączenie z GitHubem: w edytorze Lovable kliknij „+” przy polu czatu → GitHub → Connect project.
            Każda zmiana trafia tam automatycznie, a pobierzesz go przyciskiem Code → Download ZIP.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
