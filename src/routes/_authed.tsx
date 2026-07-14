import {
  createFileRoute,
  Outlet,
  useNavigate,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  LogOut,
  Loader2,
  LayoutDashboard,
  Wallet,
  Activity,
  FlaskConical,
} from "lucide-react";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/actividad", label: "Actividad", icon: Activity },
  { to: "/portfolio", label: "Portafolio", icon: Wallet },
  { to: "/backtest", label: "Backtest", icon: FlaskConical },
] as const;

function AuthedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <TrendingUp className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">InvestBot Lab</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Aviso permanente: es un entorno simulado. */}
      <div className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs text-muted-foreground">
          Paper trading — sin dinero real. Herramienta educativa, no es asesoría
          financiera.
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
