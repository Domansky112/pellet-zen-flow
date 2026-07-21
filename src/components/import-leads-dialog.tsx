import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, Download, Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importLeads } from "@/lib/leads.functions";

type RawRow = Record<string, unknown>;

type TargetField = {
  key: string;
  label: string;
  synonyms: string[];
};

const TARGET_FIELDS: TargetField[] = [
  { key: "first_name", label: "Imię", synonyms: ["imię", "imie", "first name", "imię klienta"] },
  { key: "last_name", label: "Nazwisko", synonyms: ["nazwisko", "last name", "nazwisko klienta"] },
  { key: "name", label: "Nazwa / Klient", synonyms: ["nazwa", "nazwa klienta", "name", "klient", "osoba"] },
  { key: "company", label: "Firma", synonyms: ["firma", "company", "nazwa firmy"] },
  { key: "email", label: "E-mail", synonyms: ["email", "e-mail", "mail", "adres email"] },
  { key: "phone", label: "Telefon", synonyms: ["telefon", "tel", "phone", "komórka", "komorka"] },
  { key: "city", label: "Miasto", synonyms: ["miasto", "city", "miejscowość", "miejscowosc"] },
  { key: "postal_code", label: "Kod pocztowy", synonyms: ["kod pocztowy", "kod", "postal code"] },
  { key: "source", label: "Źródło", synonyms: ["źródło", "zrodlo", "source", "kanał", "kanal"] },
  { key: "product", label: "Produkt", synonyms: ["produkt", "product", "towar"] },
  { key: "quantity", label: "Ilość", synonyms: ["ilość", "ilosc", "quantity", "tonaż", "tonaz", "waga", "tony"] },
  { key: "delivery_date", label: "Data dostawy", synonyms: ["data dostawy", "delivery date", "termin", "data"] },
  { key: "notes", label: "Uwagi", synonyms: ["uwagi", "notes", "notatki", "komentarz"] },
  { key: "has_unloading_equipment", label: "Własny rozładunek", synonyms: ["rozładunek", "własny rozładunek", "has unloading", "sprzęt do rozładunku"] },
  { key: "pooling_enabled", label: "Wspólny transport", synonyms: ["wspólny transport", "konsolidacja", "pooling", "poczekalnia"] },
];

function normalizeHeader(v: string): string {
  return v
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ź/g, "z")
    .replace(/ż/g, "z")
    .trim();
}

function detectMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const target of TARGET_FIELDS) {
    const match = columns.find((col) => {
      const n = normalizeHeader(col);
      return target.synonyms.some((s) => normalizeHeader(s) === n) || target.synonyms.includes(n);
    });
    if (match && !used.has(match)) {
      mapping[target.key] = match;
      used.add(match);
    } else {
      mapping[target.key] = "__skip__";
    }
  }
  return mapping;
}

function downloadTemplate() {
  const headers = [
    "Imię",
    "Nazwisko",
    "Firma",
    "E-mail",
    "Telefon",
    "Miasto",
    "Kod pocztowy",
    "Produkt",
    "Ilość (t)",
    "Data dostawy",
    "Uwagi",
    "Własny rozładunek",
    "Wspólny transport",
  ];
  const sample = [
    "Jan",
    "Kowalski",
    "Kowalski Sp. z o.o.",
    "jan@example.com",
    "500123456",
    "Warszawa",
    "00-001",
    "Pellet paleta",
    "2",
    "2026-08-15",
    "Proszę o kontakt przed dostawą",
    "tak",
    "tak",
  ];
  const csv = [headers.join(";"), sample.join(";")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "szablon_leady.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportLeadsDialog() {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const importFn = useServerFn(importLeads);

  const [options, setOptions] = useState({
    defaultSource: "inne" as "www" | "email" | "telefon" | "b2b" | "inne",
    defaultProduct: "pellet_paleta" as "pellet_paleta" | "pellet_bigbag" | "inne" | "",
    quantityInKg: false,
    poolingEnabled: false,
    deliveryToPooling: false,
    skipDuplicates: true,
  });

  const mappedRows = useMemo(() => {
    return rawRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const target of TARGET_FIELDS) {
        const col = mapping[target.key];
        if (col && col !== "__skip__" && row[col] !== undefined) {
          out[target.key] = row[col];
        }
      }
      return out;
    });
  }, [rawRows, mapping]);

  const previewRows = useMemo(() => mappedRows.slice(0, 5), [mappedRows]);

  function reset() {
    setFileName(null);
    setColumns([]);
    setRawRows([]);
    setMapping({});
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    setParsing(true);
    setFileName(file.name);

    if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
          finishParse(json);
        } catch (err) {
          toast.error("Nie udało się odczytać pliku Excel");
          reset();
        } finally {
          setParsing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<RawRow>(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: "",
        complete: (results) => {
          finishParse(results.data);
          setParsing(false);
        },
        error: () => {
          toast.error("Błąd parsowania CSV");
          reset();
          setParsing(false);
        },
      });
    }
  }

  function finishParse(rows: RawRow[]) {
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    setColumns(cols);
    setRawRows(rows);
    setMapping(detectMapping(cols));
  }

  const importMutation = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          rows: mappedRows,
          options: {
            defaultSource: options.defaultSource,
            defaultProduct: options.defaultProduct || null,
            quantityInKg: options.quantityInKg,
            poolingEnabled: options.poolingEnabled,
            deliveryToPooling: options.deliveryToPooling,
            skipDuplicates: options.skipDuplicates,
          },
        },
      }),
    onSuccess: (res) => {
      toast.success(`Zaimportowano ${res.created} leadów${res.skipped ? `, pominięto ${res.skipped}` : ""}.`);
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} wierszy nie zostało zaimportowanych.`, {
          description: res.errors.slice(0, 3).map((e) => `Wiersz ${e.rowIndex + 1}: ${e.message}`).join("; "),
        });
      }
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["reserved-leads"] });
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importuj z arkusza
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leadów z arkusza</DialogTitle>
          <DialogDescription>
            Wgraj plik CSV lub Excel, sprawdź mapowanie kolumn i zaimportuj leady do CRM.
          </DialogDescription>
        </DialogHeader>

        {rawRows.length === 0 ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-dashed p-10 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Przeciągnij plik CSV / Excel lub kliknij, aby wybrać.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                >
                  {parsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Wybierz plik
                </Button>
                <Button variant="ghost" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" /> Pobierz szablon
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Obsługiwane formaty: .csv (separator: przecinek lub średnik), .xlsx, .xls. Maksymalnie 1000 wierszy.
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <b>{fileName}</b> · {rawRows.length} wierszy
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="mr-2 h-4 w-4" /> Wybierz inny
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Mapowanie kolumn</h4>
                <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
                  {TARGET_FIELDS.map((target) => (
                    <div key={target.key} className="flex items-center justify-between gap-2">
                      <Label className="text-xs shrink-0 w-32">{target.label}</Label>
                      <Select
                        value={mapping[target.key] ?? "__skip__"}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [target.key]: v }))}
                      >
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="— pomijaj —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— pomijaj —</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Opcje importu</h4>
                <div className="grid gap-3 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Domyślne źródło</Label>
                      <Select
                        value={options.defaultSource}
                        onValueChange={(v) =>
                          setOptions((o) => ({ ...o, defaultSource: v as typeof o.defaultSource }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="www">WWW</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="telefon">Telefon</SelectItem>
                          <SelectItem value="b2b">B2B</SelectItem>
                          <SelectItem value="inne">Inne</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Domyślny produkt</Label>
                      <Select
                        value={options.defaultProduct || "__none__"}
                        onValueChange={(v) =>
                          setOptions((o) => ({ ...o, defaultProduct: v === "__none__" ? "" : (v as typeof o.defaultProduct) }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— brak —</SelectItem>
                          <SelectItem value="pellet_paleta">Pellet paleta</SelectItem>
                          <SelectItem value="pellet_bigbag">Pellet big-bag</SelectItem>
                          <SelectItem value="inne">Inne</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="qtyKg"
                      checked={options.quantityInKg}
                      onCheckedChange={(c) => setOptions((o) => ({ ...o, quantityInKg: Boolean(c) }))}
                    />
                    <Label htmlFor="qtyKg" className="text-xs font-normal cursor-pointer">
                      Ilość w arkuszu podana w kg (dzielę przez 1000)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pool"
                      checked={options.poolingEnabled}
                      onCheckedChange={(c) => setOptions((o) => ({ ...o, poolingEnabled: Boolean(c) }))}
                    />
                    <Label htmlFor="pool" className="text-xs font-normal cursor-pointer">
                      Domyślnie dodaj do poczekalni wspólnego transportu
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="deliveryPool"
                      checked={options.deliveryToPooling}
                      onCheckedChange={(c) => setOptions((o) => ({ ...o, deliveryToPooling: Boolean(c) }))}
                    />
                    <Label htmlFor="deliveryPool" className="text-xs font-normal cursor-pointer">
                      Data dostawy = data oczekiwania w poczekalni
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="skipDup"
                      checked={options.skipDuplicates}
                      onCheckedChange={(c) => setOptions((o) => ({ ...o, skipDuplicates: Boolean(c) }))}
                    />
                    <Label htmlFor="skipDup" className="text-xs font-normal cursor-pointer">
                      Pomiń duplikaty (ten sam e-mail lub telefon)
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {previewRows.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Podgląd ({previewRows.length} z {rawRows.length})</h4>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Nazwa</TableHead>
                        <TableHead>Telefon</TableHead>
                        <TableHead>Miasto</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Ilość</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            {String(row.name || "") ||
                              [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                              String(row.company || "") ||
                              "—"}
                          </TableCell>
                          <TableCell>{String(row.phone || "—")}</TableCell>
                          <TableCell>{String(row.city || "—")}</TableCell>
                          <TableCell>{String(row.product || "—")}</TableCell>
                          <TableCell>{String(row.quantity || "—")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Automatyczna rezerwacja magazynowa <b>nie jest wykonywana</b> podczas importu. Leady trafiają ze statusem „Nowy” i „Brak rezerwacji”. Możesz później zarezerwować towar ręcznie lub przez leada.
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Zamknij
          </Button>
          {rawRows.length > 0 && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || mappedRows.length === 0}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importuj {mappedRows.length} leadów
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
