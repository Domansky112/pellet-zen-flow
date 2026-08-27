import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getWzDocument, prepareWzDocumentData } from "@/lib/wz.functions";

type Props = {
  transportId?: string;
  poolId?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
};

type Recipient = {
  key: string;
  name: string;
  company: string | null;
  address: string;
  leadNumber: string | null;
};

/**
 * Pobiera dokument WZ dla wskazanego transportu lub pool'a.
 * Przed generowaniem pozwala wybrać, którzy odbiorcy trafią na dokument.
 */
export function WzDownloadButton({
  transportId,
  poolId,
  variant = "outline",
  size = "sm",
  className,
  label = "Pobierz WZ",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const prepare = useServerFn(prepareWzDocumentData);
  const fetchFile = useServerFn(getWzDocument);

  const openDialog = async () => {
    if (!transportId && !poolId) {
      toast.error("Brak identyfikatora transportu");
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const dto = (await prepare({ data: { transportId, poolId } })) as any;
      const list: Recipient[] = dto.recipients ?? [];
      setRecipients(list);
      setSelected(list.map((r) => r.key));
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wczytać danych WZ");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const download = async () => {
    setGenerating(true);
    try {
      const res = await fetchFile({
        data: { transportId, poolId, recipientKeys: selected },
      });
      const { file, data } = res as any;

      const blob =
        file.encoding === "base64"
          ? await (await fetch(`data:${file.mime};base64,${file.content}`)).blob()
          : new Blob([file.content], { type: file.mime });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`WZ wygenerowane: ${data.number}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wygenerować WZ");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDialog}>
        <FileText className="h-4 w-4 mr-2" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generowanie WZ</DialogTitle>
            <DialogDescription>
              Wybierz, którzy odbiorcy mają pojawić się na dokumencie.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Brak odbiorców w tym transporcie.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recipients.map((r) => (
                <label
                  key={r.key}
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(r.key)}
                    onCheckedChange={() => toggle(r.key)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">{r.company ?? r.name}</span>
                    {r.leadNumber ? (
                      <span className="text-muted-foreground"> · {r.leadNumber}</span>
                    ) : null}
                    <br />
                    <span className="text-muted-foreground text-xs">{r.address}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={download} disabled={generating || loading || selected.length === 0}>
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Generuj WZ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
