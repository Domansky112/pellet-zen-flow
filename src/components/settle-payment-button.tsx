import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettlementDialog, type SettlementResult } from "@/components/settlement-dialog";
import { settleAndConfirmWydanie } from "@/lib/leads.functions";

type Props = {
  leadId: string;
  leadName?: string | null;
  quantity?: number | null;
  defaultAmount?: number | null;
  defaultMethod?: SettlementResult["payment_method"] | null;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  label?: string;
  className?: string;
};

/**
 * Opens the settlement modal for a realized lead that has no payment record yet.
 * Uses settleAndConfirmWydanie with skip_wydanie=true so it never touches
 * warehouse stock — it only writes the payment entry (idempotent UPDATE).
 */
export function SettlePaymentButton({
  leadId,
  leadName,
  quantity,
  defaultAmount,
  defaultMethod,
  size = "sm",
  variant = "outline",
  label = "Uzupełnij płatność",
  className,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const settleFn = useServerFn(settleAndConfirmWydanie);

  const m = useMutation({
    mutationFn: (r: SettlementResult) =>
      settleFn({
        data: {
          lead_id: leadId,
          payment_amount_gross: r.payment_amount_gross,
          payment_method: r.payment_method,
          collected_on_site: r.collected_on_site,
          skip_wydanie: true,
          new_status_key: null,
        },
      }),
    onSuccess: () => {
      toast.success("Płatność zapisana");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["delivery-history"] });
      qc.invalidateQueries({ queryKey: ["payments-upcoming"] });
      qc.invalidateQueries({ queryKey: ["payments-completed"] });
      qc.invalidateQueries({ queryKey: ["payments-orphans"] });
      qc.invalidateQueries({ queryKey: ["financial-summary"] });
      qc.invalidateQueries({ queryKey: ["payment-audit"] });
    },
    onError: (e: Error) => toast.error(e.message || "Nie udało się zapisać płatności"),
  });

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4 mr-2" />
        {label}
      </Button>
      <SettlementDialog
        open={open}
        onOpenChange={setOpen}
        leadName={leadName}
        quantity={quantity ?? null}
        defaultAmount={defaultAmount ?? null}
        defaultMethod={defaultMethod ?? null}
        submitting={m.isPending}
        onConfirm={(r) => m.mutate(r)}
        title="Uzupełnij płatność / dodaj do finansów"
        description="Ten lead jest zrealizowany, ale nie ma zapisanej kwoty. Podaj ostateczną kwotę i formę płatności — trafi do modułu Płatności."
        confirmLabel="Zapisz płatność"
      />
    </>
  );
}
