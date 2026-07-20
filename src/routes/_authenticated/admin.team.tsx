import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTeamEntries, createManualPunch } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState, useEffect } from "react";
import { format, isSameDay, isSameWeek } from "date-fns";
import { Download, Clock, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: AdminTeam,
});

type Entry = { id: string; user_id: string; type: "in" | "out"; punched_at: string };
type Profile = { id: string; full_name: string; email: string | null; active: boolean };

function hoursFor(entries: Entry[]): number {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );
  let total = 0;
  let openIn: Date | null = null;
  for (const e of sorted) {
    const t = new Date(e.punched_at);
    if (e.type === "in") openIn = t;
    else if (e.type === "out" && openIn) {
      total += (t.getTime() - openIn.getTime()) / 3_600_000;
      openIn = null;
    }
  }
  return total;
}

function AdminTeam() {
  const fetchTeam = useServerFn(getTeamEntries);
  const punchManual = useServerFn(createManualPunch);
  const qc = useQueryClient();
  const [days, setDays] = useState(14);
  const q = useQuery({
    queryKey: ["team-entries", days],
    queryFn: () => fetchTeam({ data: { days } }),
  });

  const [targetUser, setTargetUser] = useState<Profile | null>(null);
  const [punchType, setPunchType] = useState<"in" | "out">("in");
  const [customTime, setCustomTime] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const manualPunchM = useMutation({
    mutationFn: (v: { targetUserId: string; type: "in" | "out"; customTime?: string }) =>
      punchManual({ data: v }),
    onSuccess: (res) => {
      toast.success(`Logged manual clock-${res.type}`);
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Failed to log punch");
    },
  });

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;
    const isoTime = customTime ? new Date(customTime).toISOString() : undefined;
    await manualPunchM.mutateAsync({
      targetUserId: targetUser.id,
      type: punchType,
      customTime: isoTime,
    });
    setDialogOpen(false);
    setCustomTime("");
  };

  const { perUser, currentlyIn } = useMemo(() => {
    const entries = (q.data?.entries ?? []) as Entry[];
    const profiles = (q.data?.profiles ?? []) as Profile[];
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const byUser = new Map<string, Entry[]>();
    for (const e of entries) {
      const arr = byUser.get(e.user_id) ?? [];
      arr.push(e);
      byUser.set(e.user_id, arr);
    }
    const now = new Date();
    const perUser = profiles.map((p) => {
      const userEntries = byUser.get(p.id) ?? [];
      const today = userEntries.filter((e) => isSameDay(new Date(e.punched_at), now));
      const week = userEntries.filter((e) =>
        isSameWeek(new Date(e.punched_at), now, { weekStartsOn: 1 }),
      );
      const sortedDesc = [...userEntries].sort(
        (a, b) => new Date(b.punched_at).getTime() - new Date(a.punched_at).getTime(),
      );
      const last = sortedDesc[0];
      return {
        profile: p,
        today: hoursFor(today),
        week: hoursFor(week),
        period: hoursFor(userEntries),
        clockedIn: last?.type === "in",
        lastAt: last?.punched_at ?? null,
      };
    });
    const currentlyIn = perUser.filter((u) => u.clockedIn);
    return { perUser, currentlyIn, entries, profById };
  }, [q.data]);

  const exportCSV = () => {
    const entries = (q.data?.entries ?? []) as Entry[];
    const profiles = (q.data?.profiles ?? []) as Profile[];
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const rows = [
      ["Name", "Email", "Type", "Timestamp (ISO)"],
      ...entries.map((e) => [
        profById.get(e.user_id)?.full_name ?? "",
        profById.get(e.user_id)?.email ?? "",
        e.type,
        e.punched_at,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `time-entries-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const [subscribed, setSubscribed] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const OneSignal = (window as any).OneSignal;
      if (OneSignal) {
        setCanSubscribe(true);
        OneSignal.push(() => {
          setSubscribed(OneSignal.User.PushSubscription.optedIn);
          OneSignal.User.PushSubscription.addEventListener("change", (event: any) => {
            setSubscribed(event.current.optedIn);
          });
        });
      }
    }
  }, []);

  const handleSubscribe = () => {
    const OneSignal = (window as any).OneSignal;
    if (OneSignal) {
      OneSignal.push(() => {
        OneSignal.User.PushSubscription.optIn();
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Team dashboard</h1>
          {canSubscribe && (
            <button
              onClick={handleSubscribe}
              className={`text-xs flex items-center gap-1 hover:underline ${
                subscribed ? "text-emerald-400" : "text-[#38bdf8]"
              }`}
            >
              <span>🔔</span> {subscribed ? "Subscribed to Push Alerts" : "Enable iPhone/Push Alerts"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currently clocked in ({currentlyIn.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {currentlyIn.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is clocked in.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {currentlyIn.map((u) => (
                <li key={u.profile.id}>
                  <Badge>
                    {u.profile.full_name} • since {format(new Date(u.lastAt!), "p")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Hours by employee</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Today</TableHead>
                <TableHead className="text-right">This week</TableHead>
                <TableHead className="text-right">Last {days}d</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perUser.map((u) => (
                <TableRow key={u.profile.id}>
                  <TableCell>
                    <div className="font-medium">{u.profile.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.profile.email}</div>
                  </TableCell>
                  <TableCell>
                    {!u.profile.active ? (
                      <Badge variant="outline">Inactive</Badge>
                    ) : u.clockedIn ? (
                      <Badge>In</Badge>
                    ) : (
                      <Badge variant="secondary">Out</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{u.today.toFixed(1)}h</TableCell>
                  <TableCell className="text-right">{u.week.toFixed(1)}h</TableCell>
                  <TableCell className="text-right">{u.period.toFixed(1)}h</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {u.clockedIn ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={manualPunchM.isPending}
                          onClick={() =>
                            manualPunchM.mutate({
                              targetUserId: u.profile.id,
                              type: "out",
                            })
                          }
                        >
                          <LogOut className="h-3 w-3 mr-1" /> Force Out
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                          disabled={manualPunchM.isPending}
                          onClick={() =>
                            manualPunchM.mutate({
                              targetUserId: u.profile.id,
                              type: "in",
                            })
                          }
                        >
                          <Clock className="h-3 w-3 mr-1" /> Force In
                        </Button>
                      )}
                      
                      <Dialog open={dialogOpen && targetUser?.id === u.profile.id} onOpenChange={(open) => {
                        if (open) {
                          setTargetUser(u.profile);
                          setDialogOpen(true);
                        } else {
                          setDialogOpen(false);
                          setTargetUser(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            Adjust
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-slate-900 text-slate-100 border-slate-800">
                          <form onSubmit={handleSubmitManual} className="space-y-4">
                            <DialogHeader>
                              <DialogTitle className="text-lg">Adjust Attendance: {u.profile.full_name}</DialogTitle>
                              <DialogDescription className="text-slate-400 text-xs">
                                Manually log a clock in or clock out for this employee.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2 text-sm">
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</label>
                                <select 
                                  value={punchType} 
                                  onChange={(e) => setPunchType(e.target.value as "in" | "out")}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-primary"
                                >
                                  <option value="in">Clock In</option>
                                  <option value="out">Clock Out</option>
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Time (Optional)</label>
                                <input 
                                  type="datetime-local" 
                                  value={customTime}
                                  onChange={(e) => setCustomTime(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-primary animate-none"
                                />
                                <span className="text-[10px] text-slate-500 block">Leave empty to log at current local time.</span>
                              </div>
                            </div>
                            <DialogFooter className="gap-2">
                              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                              <Button type="submit" disabled={manualPunchM.isPending}>Save Entry</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
