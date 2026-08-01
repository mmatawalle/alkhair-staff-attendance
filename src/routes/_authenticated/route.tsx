import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/time.functions";
import { Button } from "@/components/ui/button";
import { Clock, QrCode, Users, LogOut, History, Monitor, UserCog, Sun, Moon } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);
  const { data: me } = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => fetchMe(),
    enabled: !!user,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
      setTheme(activeTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    setTheme(nextTheme);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            <span>TimeClock</span>
          </Link>
          <nav className="flex items-center gap-1 flex-wrap">
            <Link to={me?.isAdmin ? "/admin/team" : "/dashboard"} className="text-sm px-2 py-1 hover:underline">Home</Link>
            <Link to="/history" className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> My hours
            </Link>
            {me?.isAdmin && (
              <>
                <Link to="/dashboard" search={{ view: "employee" }} className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Clock Page
                </Link>
                <Link to="/admin/team" search={{ tab: "kiosk" }} className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <Monitor className="h-3.5 w-3.5" /> Kiosk
                </Link>
                <Link to="/admin/team" search={{ tab: "overview" }} className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Team
                </Link>
                <Link to="/admin/team" search={{ tab: "staff" }} className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <UserCog className="h-3.5 w-3.5" /> Staff
                </Link>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground mr-1">
              {theme === "light" ? (
                <Moon className="h-4.5 w-4.5" />
              ) : (
                <Sun className="h-4.5 w-4.5 text-amber-500" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
