import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWzDocument } from "@/lib/wz.functions";

type Props = {
  transportId?: string;
  poolId?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
};

/**
 * Pobiera dokument WZ (na razie mock HTML) dla wskazanego transportu lub pool'a.
 * Modularne — gdy podepniemy prawdziwy generator PDF, zmieni się TYLKO
 * `generateWzFile` po stronie backendu; ten komponent działa dalej bez zmian.
 */
export function WzDownloadButton({
  transportId,
  poolId,
  variant = "outline",
  size = "sm",
  className,
  label = "Pobierz WZ",
}: Props) {
  const [loading, setLoading] = useState(false);
  const fn = useServerFn(getWzDocument);

  const onClick = async () => {
    if (!transportId && !poolId) {
      toast.error("Brak identyfikatora transportu");
      return;
    }
    setLoading(true);
    try {
      const res = await fn({ data: { transportId, poolId } });
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
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wygenerować WZ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={onClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );
}
