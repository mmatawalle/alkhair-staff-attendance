import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, getMyEntries, punchClock } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { QrCode, LogIn, LogOut, History } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Home,
});

function Home() {
  const fetchMe = useServerFn(getMe);
  const fetchEntries = useServerFn(getMyEntries);
  const punch = useServerFn(punchClock);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const entriesQ = useQuery({
    queryKey: ["my-entries", 7],
    queryFn: () => fetchEntries({ data: { days: 7 } }),
  });

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const lastType = meQ.data?.lastEntry?.type;
  const isClockedIn = lastType === "in";

  const doPunch = async (token: string) => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await punch({ data: { token: t } });
      toast.success(`Clocked ${res.type === "in" ? "in" : "out"} at ${format(new Date(res.punched_at), "p")}`);
      setCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["my-entries", 7] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not punch");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Hi, {meQ.data?.profile?.full_name || "there"}</span>
            <Badge variant={isClockedIn ? "default" : "secondary"}>
              {isClockedIn ? "Clocked in" : "Clocked out"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {meQ.data?.lastEntry
              ? `Last ${meQ.data.lastEntry.type} ${formatDistanceToNow(new Date(meQ.data.lastEntry.punched_at), { addSuffix: true })}`
              : "No punches yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-3">
            <QrCode className="h-10 w-10 mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Scan the shop's QR code with your phone camera, or enter today's code below.
            </p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <Input
                placeholder="Today's code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doPunch(code);
                }}
              />
              <Button onClick={() => doPunch(code)} disabled={busy || !code.trim()}>
                {isClockedIn ? (
                  <>
                    <LogOut className="h-4 w-4 mr-1" /> Clock out
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-1" /> Clock in
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><History className="h-4 w-4" /> Recent punches</span>
            <Link to="/history" className="text-sm text-primary hover:underline">View all</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entriesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (entriesQ.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No punches in the last 7 days.</p>
          ) : (
            <ul className="divide-y">
              {entriesQ.data!.slice(0, 10).map((e) => (
                <li key={e.id} className="py-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {e.type === "in" ? (
                      <LogIn className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <LogOut className="h-4 w-4 text-amber-600" />
                    )}
                    <span className="capitalize">{e.type}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(e.punched_at), "EEE, MMM d • p")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
