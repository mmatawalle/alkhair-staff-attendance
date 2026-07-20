import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, getMyEntries, punchClock } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { QrCode, LogIn, LogOut, History, Camera, Clock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";

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
  const [scanOpen, setScanOpen] = useState(false);

  const [nowTime, setNowTime] = useState<number | null>(null);

  useEffect(() => {
    setNowTime(Date.now());
    const interval = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const lastType = meQ.data?.lastEntry?.type;
  const isClockedIn = lastType === "in";

  const elapsedStr = useMemo(() => {
    if (!nowTime || !isClockedIn || !meQ.data?.lastEntry?.punched_at) return "";
    const punchTime = new Date(meQ.data.lastEntry.punched_at).getTime();
    const diffMs = Math.max(0, nowTime - punchTime);
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }, [isClockedIn, meQ.data?.lastEntry?.punched_at, nowTime]);

  const weeklyHours = useMemo(() => {
    const entries = entriesQ.data || [];
    const sorted = [...entries].sort(
      (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime()
    );
    let total = 0;
    let openIn: Date | null = null;
    for (const e of sorted) {
      const t = new Date(e.punched_at);
      if (e.type === "in") {
        openIn = t;
      } else if (e.type === "out" && openIn) {
        total += (t.getTime() - openIn.getTime()) / 3600000;
        openIn = null;
      }
    }
    if (openIn && nowTime) {
      total += (nowTime - openIn.getTime()) / 3600000;
    }
    return total;
  }, [entriesQ.data, isClockedIn, nowTime]);

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

  const targetHours = Number(meQ.data?.profile?.weekly_target_hours) || 40.0;

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
          {isClockedIn && elapsedStr && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-4 text-center space-y-1 animate-pulse-slow">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" /> Active Shift Time
              </div>
              <div className="text-3xl font-mono font-bold text-emerald-300">
                {elapsedStr}
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-3">
            <QrCode className="h-10 w-10 mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Scan the shop's QR code, or enter today's code below.
            </p>
            <Button
              variant="secondary"
              className="mx-auto"
              onClick={() => setScanOpen(true)}
            >
              <Camera className="h-4 w-4 mr-1" /> Scan QR with camera
            </Button>
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
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Hours this week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Weekly progress</span>
            <span className="font-semibold text-slate-200">{weeklyHours.toFixed(1)}h / {targetHours.toFixed(1)}h</span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-500" 
              style={{ width: `${Math.min((weeklyHours / targetHours) * 100, 100)}%` }} 
            />
          </div>
        </CardContent>
      </Card>

      <QrScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(scanned) => {
          navigate({ to: "/clock", search: { code: scanned } });
        }}
      />

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
