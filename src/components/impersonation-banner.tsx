import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getImpersonation, clearImpersonation, type ImpersonationState } from "@/lib/impersonation";

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setState(getImpersonation());
  }, []);

  if (!state) return null;

  const back = async () => {
    setBusy(true);
    try {
      await qc.cancelQueries();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.setSession({
        access_token: state.admin_access_token,
        refresh_token: state.admin_refresh_token,
      });
      if (error) throw new Error(error.message);
      clearImpersonation();
      qc.clear();
      window.location.href = "/ustawienia?section=users";
    } catch (e) {
      setBusy(false);
      clearImpersonation();
      toast.error("Sesja administratora wygasła — zaloguj się ponownie.");
      await supabase.auth.signOut();
      window.location.href = "/auth";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <UserCog className="h-4 w-4 shrink-0" />
      <span>
        Tryb podglądu — pracujesz na koncie <b>{state.target_email}</b>. Konto administratora:{" "}
        <b>{state.admin_email}</b>.
      </span>
      <Button size="sm" variant="outline" className="ml-auto h-7" onClick={back} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1 h-3.5 w-3.5" />}
        Wróć do konta administratora
      </Button>
    </div>
  );
}
