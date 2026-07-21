import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CurrentUser = { id: string; email: string | null; name: string | null };

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      setUser({
        id: data.user.id,
        email: data.user.email ?? null,
        name: (meta.full_name as string) ?? (meta.name as string) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return user;
}
