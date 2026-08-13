import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/use-user-role";
import { ROLE_LABEL, defaultRouteFor } from "@/lib/rbac";

export const Route = createFileRoute("/403")({
  head: () => ({
    meta: [
      { title: "Brak dostępu — Słoneczny Pellet OS" },
      { name: "description", content: "Nie masz uprawnień do wyświetlenia tej sekcji systemu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Forbidden,
});

function Forbidden() {
  const { roles, loading } = useUserRole();
  const target = defaultRouteFor(roles);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">Brak dostępu (403)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Twoja rola{" "}
          {loading
            ? ""
            : roles.length
              ? `(${roles.map((r) => ROLE_LABEL[r]).join(", ")}) `
              : "(brak przypisanej roli) "}
          nie ma uprawnień do wyświetlenia tej sekcji. Skontaktuj się z administratorem, jeśli
          potrzebujesz dostępu.
        </p>
        <Button asChild className="mt-6">
          <Link to={target === "/403" ? "/dashboard" : target}>Powrót do pulpitu</Link>
        </Button>
      </div>
    </div>
  );
}
