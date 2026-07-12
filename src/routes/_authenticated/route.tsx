import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/time.functions";
import { Button } from "@/components/ui/button";
import { Clock, QrCode, Users, LogOut, History, Monitor, UserCog } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            <span>TimeClock</span>
          </Link>
          <nav className="flex items-center gap-1 flex-wrap">
            <Link to="/dashboard" className="text-sm px-2 py-1 hover:underline">Home</Link>
            <Link to="/history" className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> My hours
            </Link>
            {me?.isAdmin && (
              <>
                <Link to="/kiosk-setup" className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <Monitor className="h-3.5 w-3.5" /> Kiosk
                </Link>
                <Link to="/admin/team" className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Team
                </Link>
                <Link to="/admin/staff" className="text-sm px-2 py-1 hover:underline flex items-center gap-1">
                  <UserCog className="h-3.5 w-3.5" /> Staff
                </Link>
              </>
            )}
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
