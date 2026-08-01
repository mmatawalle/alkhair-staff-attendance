import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/time.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Clock, QrCode, Users, LogOut, History, Monitor, UserCog, Sun, Moon, Menu } from "lucide-react";

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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const navLinks = (
    <>
      <NavItem to={me?.isAdmin ? "/admin/team" : "/dashboard"} icon={<Clock className="h-4 w-4" />} label="Home" />
      <NavItem to="/history" icon={<History className="h-4 w-4" />} label="My hours" />
      {me?.isAdmin && (
        <>
          <NavItem to="/dashboard" search={{ view: "employee" as const }} icon={<QrCode className="h-4 w-4" />} label="Clock page" />
          <NavItem to="/admin/team" search={{ tab: "kiosk" as const }} icon={<Monitor className="h-4 w-4" />} label="Kiosk" />
          <NavItem to="/admin/team" search={{ tab: "overview" as const }} icon={<Users className="h-4 w-4" />} label="Team" />
          <NavItem to="/admin/team" search={{ tab: "staff" as const }} icon={<UserCog className="h-4 w-4" />} label="Staff" />
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-3 sm:px-4 h-14 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
            <Clock className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">TimeClock</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks}
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9 text-muted-foreground hover:text-foreground">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-amber-500" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </nav>

          {/* Mobile nav */}
          <div className="flex md:hidden items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9 text-muted-foreground">
              {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5 text-amber-500" />}
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-xs p-0 flex flex-col">
                <SheetHeader className="px-4 py-4 border-b text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" /> TimeClock
                  </SheetTitle>
                </SheetHeader>
                <nav
                  className="flex-1 overflow-y-auto p-2 flex flex-col gap-1"
                  onClick={() => setMenuOpen(false)}
                >
                  {navLinks}
                </nav>
                <div className="border-t p-3">
                  <Button variant="outline" className="w-full" onClick={signOut} disabled={signingOut}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-6 pb-[env(safe-area-inset-bottom)]">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  search,
  icon,
  label,
}: {
  to: string;
  search?: Record<string, string>;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={search as any}
      activeOptions={{ exact: false }}
      className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground md:px-2 md:py-1.5"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
