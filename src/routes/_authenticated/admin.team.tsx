import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PushNotificationsButton } from "@/components/push-notifications-dialog";

import {
  getMe,
  getTeamEntries,
  createManualPunch,
  listStaff,
  setAdminRole,
  setStaffActive,
  getOrCreateTodayCode,
  regenerateTodayCode,
  listKioskDevices,
  pairKioskDevice,
  revokeKioskDevice,
  deleteTimeEntry,
  updateTimeEntry,
  setStaffWeeklyTarget,
} from "@/lib/time.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useMemo, useState, useEffect } from "react";
import { format, isSameDay, isSameWeek, formatDistanceToNow } from "date-fns";
import {
  Download,
  Clock,
  LogOut,
  Users,
  Activity,
  Monitor,
  Search,
  RefreshCw,
  Trash2,
  Calendar,
  Settings,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { z } from "zod";

const adminSearchSchema = z.object({
  tab: z.enum(["overview", "staff", "kiosk"]).optional().catch("overview"),
});

export const Route = createFileRoute("/_authenticated/admin/team")({
  validateSearch: adminSearchSchema,
  component: AdminTeam,
});

type Entry = { id: string; user_id: string; type: "in" | "out"; punched_at: string };
type Profile = { id: string; full_name: string; email: string | null; active: boolean; weekly_target_hours?: number };

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

function TargetInput({
  userId,
  initial,
  onSave,
  saving,
}: {
  userId: string;
  initial: number;
  onSave: (userId: string, value: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState<string>(String(initial ?? 40));
  useEffect(() => {
    setVal(String(initial ?? 40));
  }, [initial]);
  const commit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 168) {
      toast.error("Enter hours between 0 and 168");
      setVal(String(initial ?? 40));
      return;
    }
    if (n === Number(initial)) return;
    onSave(userId, n);
  };
  return (
    <div className="flex items-center gap-1 justify-end">
      <Input
        type="number"
        min={0}
        max={168}
        step={0.5}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={saving}
        className="h-8 w-20 text-right bg-background border border-border"
      />
      <span className="text-xs text-muted-foreground">h/wk</span>
    </div>
  );
}

function AdminTeam() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/admin/team" });
  const tab = search.tab ?? "overview";

  const fetchMe = useServerFn(getMe);
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  useEffect(() => {
    if (meQ.data && !meQ.data.isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [meQ.data, navigate]);

  const fetchTeam = useServerFn(getTeamEntries);
  const punchManual = useServerFn(createManualPunch);
  const fetchStaffList = useServerFn(listStaff);
  const fetchCode = useServerFn(getOrCreateTodayCode);
  const fetchKioskDevices = useServerFn(listKioskDevices);

  const setRole = useServerFn(setAdminRole);
  const setActive = useServerFn(setStaffActive);
  const pair = useServerFn(pairKioskDevice);
  const revoke = useServerFn(revokeKioskDevice);
  const regen = useServerFn(regenerateTodayCode);
  const deletePunch = useServerFn(deleteTimeEntry);
  const updatePunch = useServerFn(updateTimeEntry);
  const setTarget = useServerFn(setStaffWeeklyTarget);

  const qc = useQueryClient();
  const [days, setDays] = useState(14);

  // Queries
  const q = useQuery({
    queryKey: ["team-entries", days],
    queryFn: () => fetchTeam({ data: { days } }),
  });

  const staffQ = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaffList(),
  });

  const devicesQ = useQuery({
    queryKey: ["kiosk-devices"],
    queryFn: () => fetchKioskDevices(),
    enabled: tab === "kiosk",
  });

  const codeQ = useQuery({
    queryKey: ["today-code"],
    queryFn: () => fetchCode(),
    refetchInterval: 60_000,
    enabled: tab === "kiosk" || tab === "overview",
  });

  // State
  const [targetUser, setTargetUser] = useState<Profile | null>(null);
  const [punchType, setPunchType] = useState<"in" | "out">("in");
  const [customTime, setCustomTime] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out" | "inactive">("all");
  
  // Auditing sheet states
  const [selectedAuditEmployee, setSelectedAuditEmployee] = useState<Profile | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editType, setEditType] = useState<"in" | "out">("in");
  const [editTime, setEditTime] = useState("");

  // Kiosk settings states
  const [kioskLabel, setKioskLabel] = useState("Shop computer");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Countdown timer & rotation checks
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const expiresAt = codeQ.data?.expires_at;
  const token = codeQ.data?.token;

  useEffect(() => {
    if (expiresAt && new Date(expiresAt).getTime() <= now) {
      qc.invalidateQueries({ queryKey: ["today-code"] });
    }
  }, [now, expiresAt, qc]);

  useEffect(() => {
    if (!token) {
      setQrDataUrl(null);
      return;
    }
    const url = `${window.location.origin}/clock?code=${encodeURIComponent(token)}`;
    QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQrDataUrl);
  }, [token]);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  const mm = Math.floor(secondsLeft / 60).toString();
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  // Mutations
  const roleM = useMutation({
    mutationFn: (v: { user_id: string; makeAdmin: boolean }) => setRole({ data: v }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeM = useMutation({
    mutationFn: (v: { user_id: string; active: boolean }) => setActive({ data: v }),
    onSuccess: () => {
      toast.success("Updated active status");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const targetM = useMutation({
    mutationFn: (v: { user_id: string; weekly_target_hours: number }) => setTarget({ data: v }),
    onSuccess: () => {
      toast.success("Weekly target updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pairM = useMutation({
    mutationFn: (v: { label: string }) => pair({ data: v }),
    onSuccess: () => {
      toast.success("Kiosk device paired");
      qc.invalidateQueries({ queryKey: ["kiosk-devices"] });
      setKioskLabel("Shop computer");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not pair kiosk"),
  });

  const revokeM = useMutation({
    mutationFn: (v: { id: string }) => revoke({ data: v }),
    onSuccess: () => {
      toast.success("Kiosk access revoked");
      qc.invalidateQueries({ queryKey: ["kiosk-devices"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not revoke kiosk"),
  });

  const regenM = useMutation({
    mutationFn: () => regen(),
    onSuccess: () => {
      toast.success("QR attendance code rotated");
      qc.invalidateQueries({ queryKey: ["today-code"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to rotate code"),
  });

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

  const deleteEntryM = useMutation({
    mutationFn: (v: { id: string }) => deletePunch({ data: v }),
    onSuccess: () => {
      toast.success("Attendance entry deleted");
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Failed to delete entry");
    },
  });

  const updateEntryM = useMutation({
    mutationFn: (v: { id: string; type: "in" | "out"; punched_at: string }) =>
      updatePunch({ data: v }),
    onSuccess: () => {
      toast.success("Attendance entry updated");
      qc.invalidateQueries({ queryKey: ["team-entries", days] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Failed to update entry");
    },
  });

  // Calculate Data Insights
  const { perUser, currentlyIn, entries, profById } = useMemo(() => {
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
    const currentlyIn = perUser.filter((u) => u.clockedIn && u.profile.active);
    return { perUser, currentlyIn, entries, profById };
  }, [q.data]);

  const totalWeeklyHours = useMemo(() => {
    return perUser.reduce((sum, u) => sum + u.week, 0);
  }, [perUser]);

  // Recharts: Work Hours Over Time (Daily totals)
  const dailyHoursData = useMemo(() => {
    const userEntries = new Map<string, Entry[]>();
    for (const e of entries) {
      const arr = userEntries.get(e.user_id) ?? [];
      arr.push(e);
      userEntries.set(e.user_id, arr);
    }

    const now = new Date();
    const dateMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dateStr = format(d, "yyyy-MM-dd");
      dateMap.set(dateStr, 0);
    }

    for (const [, uEntries] of userEntries.entries()) {
      const sorted = [...uEntries].sort(
        (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
      );
      let openIn: Date | null = null;
      for (const e of sorted) {
        const t = new Date(e.punched_at);
        if (e.type === "in") {
          openIn = t;
        } else if (e.type === "out" && openIn) {
          const hrs = (t.getTime() - openIn.getTime()) / 3_600_000;
          const dateStr = format(openIn, "yyyy-MM-dd");
          if (dateMap.has(dateStr)) {
            dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + hrs);
          }
          openIn = null;
        }
      }
    }

    return Array.from(dateMap.entries()).map(([date, hours]) => ({
      date: format(new Date(date), "MMM dd"),
      hours: parseFloat(hours.toFixed(1)),
    }));
  }, [entries, days]);

  // Recharts: Employee Workload Comparison
  const employeeHoursData = useMemo(() => {
    return perUser
      .map((u) => ({
        name: u.profile.full_name || u.profile.email?.split("@")[0] || "Unknown",
        hours: parseFloat(u.period.toFixed(1)),
      }))
      .filter((u) => u.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);
  }, [perUser]);

  // Filtering Employee List
  const filteredStaff = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const list = staffQ.data ?? [];
    const statusMap = new Map(perUser.map((u) => [u.profile.id, u]));

    return list.filter((u: any) => {
      const profileInfo = statusMap.get(u.id);
      const isSearchMatch =
        !query ||
        u.full_name.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query));

      if (!isSearchMatch) return false;

      if (statusFilter === "all") return u.active;
      if (statusFilter === "in") return u.active && profileInfo?.clockedIn;
      if (statusFilter === "out") return u.active && !profileInfo?.clockedIn;
      if (statusFilter === "inactive") return !u.active;

      return true;
    });
  }, [staffQ.data, searchQuery, statusFilter, perUser]);

  // Selected Employee Audit entries
  const selectedEmployeeEntries = useMemo(() => {
    if (!selectedAuditEmployee) return [];
    return entries.filter((e) => e.user_id === selectedAuditEmployee.id);
  }, [entries, selectedAuditEmployee]);

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

  const handleEditEntry = (entry: Entry) => {
    setEditingEntryId(entry.id);
    setEditType(entry.type);
    setEditTime(format(new Date(entry.punched_at), "yyyy-MM-dd'T'HH:mm"));
  };

  const saveEditedEntry = async (id: string) => {
    await updateEntryM.mutateAsync({
      id,
      type: editType,
      punched_at: new Date(editTime).toISOString(),
    });
    setEditingEntryId(null);
  };

  const exportCSV = () => {
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

  const setTab = (newTab: string) => {
    navigate({
      search: ((prev: any) => ({ ...prev, tab: newTab })) as any,
    });
  };




  // Chart configuration labels
  const areaChartConfig = {
    hours: {
      label: "Work Hours",
      color: "hsl(var(--primary))",
    },
  };

  const barChartConfig = {
    hours: {
      label: "Total Hours",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-3xl">Admin Control Center</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Consolidated operational dashboard for Alkhair attendance telemetry.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <div className="col-span-2 sm:col-auto [&>button]:w-full sm:[&>button]:w-auto">
            <PushNotificationsButton />
          </div>

          <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
            <Link to="/dashboard" search={{ view: "employee" }}>
              <Clock className="h-4 w-4 mr-1.5" /> Clock Page
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-10 sm:h-9" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1.5" /> Export Logs
          </Button>
        </div>
      </div>

      {/* Tabs Layout Navigation */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg bg-card border rounded-lg p-1 h-auto">
          <TabsTrigger value="overview" className="flex flex-col gap-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:text-sm">
            <Activity className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex flex-col gap-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:text-sm">
            <Users className="h-4 w-4" /> <span className="sm:hidden">Staff</span><span className="hidden sm:inline">Staff Management</span>
          </TabsTrigger>
          <TabsTrigger value="kiosk" className="flex flex-col gap-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:text-sm">
            <Monitor className="h-4 w-4" /> <span className="sm:hidden">Kiosk</span><span className="hidden sm:inline">Kiosk Setup</span>
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* TAB 1: OVERVIEW & ANALYTICS                             */}
        {/* ======================================================== */}
        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          {/* KPI Dashboard Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Present Today
                </CardTitle>
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{currentlyIn.length}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Active team members clocked in right now</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Active Staff
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{perUser.filter((u) => u.profile.active).length}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Active worker accounts registered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Team Hours (Week)
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalWeeklyHours.toFixed(1)}h</div>
                <p className="text-[10px] text-muted-foreground mt-1">Total cumulative hours logged this week</p>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Today's QR Code
                </CardTitle>
                <Clock className="h-4 w-4 text-primary animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-mono font-bold text-primary select-all">
                  {token || "---"}
                </div>
                <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin-slow" /> Rotates in {mm}:{ss}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-primary" /> Daily Attendance Hours
                  </CardTitle>
                  <CardDescription>Total hours worked across the whole team</CardDescription>
                </div>
                <div className="flex gap-1.5">
                  {[7, 14, 30].map((d) => (
                    <Button
                      key={d}
                      variant={days === d ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDays(d)}
                    >
                      {d}d
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {dailyHoursData.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                    No data recorded in this period.
                  </div>
                ) : (
                  <ChartContainer config={areaChartConfig} className="h-[250px] w-full">
                    <AreaChart data={dailyHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-hours)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="var(--color-hours)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                      <XAxis dataKey="date" className="text-muted-foreground text-[10px]" tickLine={false} axisLine={false} />
                      <YAxis className="text-muted-foreground text-[10px]" tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="hours"
                        stroke="var(--color-hours)"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorHours)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-1">
                  <Users className="h-4 w-4 text-primary" /> Workload comparison
                </CardTitle>
                <CardDescription>Total hours worked by employee (Top 10) in last {days} days</CardDescription>
              </CardHeader>
              <CardContent>
                {employeeHoursData.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                    No employees have logged hours in this period.
                  </div>
                ) : (
                  <ChartContainer config={barChartConfig} className="h-[250px] w-full">
                    <BarChart
                      data={employeeHoursData}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
                      <XAxis type="number" className="text-muted-foreground text-[10px]" tickLine={false} axisLine={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        className="text-muted-foreground text-[10px]"
                        tickLine={false}
                        axisLine={false}
                        width={90}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="hours" fill="var(--color-hours)" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed Section */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Live Ticker Feed */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-emerald-500" /> Recent Attendance Log
                </CardTitle>
                <CardDescription>Live timeline of team clockings in the last {days} days</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[350px] overflow-y-auto space-y-4 pr-2">
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No punches registered in the select period.</p>
                ) : (
                  <div className="relative border-l pl-4 ml-3 space-y-5 py-1">
                    {entries.slice(0, 15).map((e) => {
                      const user = profById.get(e.user_id);
                      const isClockIn = e.type === "in";
                      return (
                        <div key={e.id} className="relative group">
                          {/* Indicator dot */}
                          <div
                            className={`absolute -left-[21px] top-1.5 rounded-full border-4 border-background h-3.5 w-3.5 ${
                              isClockIn ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          />
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7 bg-muted border text-xs">
                                <AvatarFallback className="text-[10px]">
                                  {user?.full_name ? user.full_name.split(" ").map((n) => n[0]).join("") : "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <span className="font-semibold text-sm">
                                  {user?.full_name || "Unknown Staff"}
                                </span>{" "}
                                <span className="text-muted-foreground text-xs">
                                  clocked {isClockIn ? "IN" : "OUT"}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground bg-muted border px-2 py-0.5 rounded-full select-none">
                              {formatDistanceToNow(new Date(e.punched_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Currently In Detail Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Monitor className="h-4 w-4 text-emerald-500" /> Active Workers ({currentlyIn.length})
                </CardTitle>
                <CardDescription>Who is currently on shift at the shop</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[350px] overflow-y-auto space-y-2 pr-2">
                {currentlyIn.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">All staff are clocked out.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {currentlyIn.map((u) => (
                      <li
                        key={u.profile.id}
                        className="flex items-center justify-between gap-2 p-2 border rounded-lg bg-card hover:bg-muted/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-xs font-semibold">{u.profile.full_name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          since {format(new Date(u.lastAt!), "p")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Hours by Employee comparison list */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Hours by employee</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6 overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">This week</TableHead>
                    <TableHead className="text-right">Last {days}d</TableHead>
                    <TableHead className="text-right">Weekly target</TableHead>
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
                      <TableCell className="text-right">
                        <div>{u.week.toFixed(1)}h / {Number(u.profile.weekly_target_hours ?? 40).toFixed(1)}h</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(() => {
                            const t = Number(u.profile.weekly_target_hours ?? 40);
                            const pct = t > 0 ? Math.min(100, (u.week / t) * 100) : 0;
                            return `${pct.toFixed(0)}%`;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{u.period.toFixed(1)}h</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {Number(u.profile.weekly_target_hours ?? 40).toFixed(1)}h
                      </TableCell>
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedAuditEmployee(u.profile)}
                          >
                            Audit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 2: STAFF MANAGEMENT                                  */}
        {/* ======================================================== */}
        <TabsContent value="staff" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 border-b pb-4">
              <div>
                <CardTitle className="text-lg">Registered Employees</CardTitle>
                <CardDescription>Manage user roles, toggles, and audit work cards.</CardDescription>
              </div>
            </CardHeader>

            {/* Filter Toolbar */}
            <div className="p-6 pb-2 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-b bg-muted/10">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {[
                  { id: "all", label: "Active Employees" },
                  { id: "in", label: "Clocked In" },
                  { id: "out", label: "Clocked Out" },
                  { id: "inactive", label: "Inactive Accounts" },
                ].map((f) => (
                  <Button
                    key={f.id}
                    variant={statusFilter === f.id ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={() => setStatusFilter(f.id as any)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <CardContent className="p-0 overflow-x-auto">
              {staffQ.isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading roster...</div>
              ) : filteredStaff.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No employees found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee Details</TableHead>
                      <TableHead>System Roles</TableHead>
                      <TableHead className="text-center">Admin Rights</TableHead>
                      <TableHead className="text-center">Access Status</TableHead>
                      <TableHead className="text-right">Weekly target</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaff.map((u: any) => {
                      const isAdmin = u.roles.includes("admin");
                      const profileInfo = perUser.find((x) => x.profile.id === u.id);
                      return (
                        <TableRow key={u.id} className="hover:bg-muted/10">
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 bg-muted border text-xs">
                                <AvatarFallback>
                                  {u.full_name ? u.full_name.split(" ").map((n: string) => n[0]).join("") : "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-semibold text-sm flex items-center gap-1.5">
                                  {u.full_name || "—"}
                                  {u.active && profileInfo?.clockedIn && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {u.roles.length === 0 && <Badge variant="outline">none</Badge>}
                              {u.roles.map((r: string) => (
                                <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                                  {r}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={isAdmin}
                              onCheckedChange={(v) => roleM.mutate({ user_id: u.id, makeAdmin: v })}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={u.active}
                              onCheckedChange={(v) => activeM.mutate({ user_id: u.id, active: v })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <TargetInput
                              userId={u.id}
                              initial={Number(u.weekly_target_hours ?? 40)}
                              saving={targetM.isPending}
                              onSave={(user_id, weekly_target_hours) =>
                                targetM.mutate({ user_id, weekly_target_hours })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              {u.active && (
                                <>
                                  {profileInfo?.clockedIn ? (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      disabled={manualPunchM.isPending}
                                      onClick={() =>
                                        manualPunchM.mutate({
                                          targetUserId: u.id,
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
                                          targetUserId: u.id,
                                          type: "in",
                                        })
                                      }
                                    >
                                      <Clock className="h-3 w-3 mr-1" /> Force In
                                    </Button>
                                  )}
                                </>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setSelectedAuditEmployee(u)}
                              >
                                <Calendar className="h-3 w-3 mr-1.5" /> Audit
                              </Button>

                              <Dialog
                                open={dialogOpen && targetUser?.id === u.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setTargetUser(u);
                                    setDialogOpen(true);
                                  } else {
                                    setDialogOpen(false);
                                    setTargetUser(null);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                    Adjust
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-slate-900 text-slate-100 border-slate-800">
                                  <form onSubmit={handleSubmitManual} className="space-y-4">
                                    <DialogHeader>
                                      <DialogTitle className="text-lg">
                                        Manual Entry: {u.full_name}
                                      </DialogTitle>
                                      <DialogDescription className="text-slate-400 text-xs">
                                        Manually record an attendance punch on behalf of this employee.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-3 py-2 text-sm">
                                      <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                          Punch Type
                                        </label>
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
                                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                          Date & Time (Optional)
                                        </label>
                                        <input
                                          type="datetime-local"
                                          value={customTime}
                                          onChange={(e) => setCustomTime(e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-primary animate-none"
                                        />
                                        <span className="text-[10px] text-slate-500 block">
                                          Leave blank to log at the current server time.
                                        </span>
                                      </div>
                                    </div>
                                    <DialogFooter className="gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setDialogOpen(false)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button type="submit" disabled={manualPunchM.isPending}>
                                        Save Punch
                                      </Button>
                                    </DialogFooter>
                                  </form>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 3: KIOSK SETUP & CODE SETTINGS                       */}
        {/* ======================================================== */}
        <TabsContent value="kiosk" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Live Rotating QR Display */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 border-b pb-4">
                <div>
                  <CardTitle className="text-base">Shop Attendance display</CardTitle>
                  <CardDescription>
                    This code rotates automatically to prevent off-site scan fraud.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenM.mutate()}
                  disabled={regenM.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Force rotate code
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                {qrDataUrl ? (
                  <div className="border bg-card p-4 rounded-xl shadow-inner max-w-sm w-full flex items-center justify-center">
                    <img src={qrDataUrl} alt="Today's QR code" className="w-56 h-56 md:w-72 md:h-72" />
                  </div>
                ) : (
                  <div className="w-56 h-56 md:w-72 md:h-72 bg-muted animate-pulse rounded-xl" />
                )}
                {token && (
                  <div className="text-center space-y-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Today's Token</p>
                    <p className="text-4xl font-mono font-bold tracking-widest text-primary select-all">
                      {token}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin-slow" /> New code in {mm}:{ss}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Kiosk Device Pairing Interface */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pair a Kiosk PC</CardTitle>
                  <CardDescription>
                    Pair shop computers/terminals. Once paired, the browser on that machine will remember
                    its credentials and can display the QR code without login credentials.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="Label (e.g. Counter PC)"
                      value={kioskLabel}
                      onChange={(e) => setKioskLabel(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      onClick={() => pairM.mutate({ label: kioskLabel.trim() })}
                      disabled={pairM.isPending}
                    >
                      Generate Pair Token
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Paired Terminals</CardTitle>
                  <CardDescription>Devices that are authorized to display kiosk screens.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {devicesQ.isLoading ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Loading terminals...</p>
                  ) : (devicesQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No terminals paired yet.</p>
                  ) : (
                    <ul className="divide-y max-h-[220px] overflow-y-auto pr-1">
                      {(devicesQ.data ?? []).map((d: any) => (
                        <li key={d.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="font-semibold">{d.label || "Kiosk Screen"}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Paired: {format(new Date(d.created_at), "MMM d")}
                              {d.last_seen_at
                                ? ` • Active ${format(new Date(d.last_seen_at), "p")}`
                                : " • Never loaded"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {d.revoked_at ? (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                Revoked
                              </Badge>
                            ) : (
                              <>
                                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/20 px-1 py-0">
                                  Active
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:text-destructive"
                                  onClick={() => revokeM.mutate({ id: d.id })}
                                  disabled={revokeM.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ======================================================== */}
      {/* AUDITING DRAWER (SHEET) FOR SINGLE EMPLOYEE              */}
      {/* ======================================================== */}
      <Sheet open={!!selectedAuditEmployee} onOpenChange={(open) => { if (!open) setSelectedAuditEmployee(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col h-full bg-background border-l">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Attendance Log
            </SheetTitle>
            <SheetDescription className="text-xs">
              Review and correct punches for <strong className="text-foreground">{selectedAuditEmployee?.full_name}</strong>
            </SheetDescription>
          </SheetHeader>

          {/* List of Time Entries */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {selectedEmployeeEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No punches registered in the active period.</p>
            ) : (
              <div className="space-y-2">
                {selectedEmployeeEntries.map((e) => {
                  const isEditing = editingEntryId === e.id;
                  return (
                    <div key={e.id} className="p-3 border rounded-lg bg-card space-y-3 shadow-sm hover:shadow-md transition-shadow">
                      {isEditing ? (
                        // Edit Mode Form
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Edit Entry
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              ID: {e.id.slice(0, 8)}...
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold text-muted-foreground">Type</label>
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value as "in" | "out")}
                                className="w-full bg-background border rounded p-1.5 focus:outline-none focus:border-primary"
                              >
                                <option value="in">Clock In</option>
                                <option value="out">Clock Out</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold text-muted-foreground">Timestamp</label>
                              <input
                                type="datetime-local"
                                value={editTime}
                                onChange={(e) => setEditTime(e.target.value)}
                                className="w-full bg-background border rounded p-1 focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-1.5 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              onClick={() => setEditingEntryId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              onClick={() => saveEditedEntry(e.id)}
                              disabled={updateEntryM.isPending}
                            >
                              Save Changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Display Mode
                        <div className="flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={e.type === "in" ? "default" : "secondary"}
                                className={`text-[10px] px-1.5 uppercase font-mono ${
                                  e.type === "in"
                                    ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 border border-amber-500/20"
                                }`}
                              >
                                {e.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(e.punched_at), "p")}
                              </span>
                            </div>
                            <div className="text-xs font-semibold">
                              {format(new Date(e.punched_at), "EEE, MMM d, yyyy")}
                            </div>
                          </div>

                          {/* Quick Audit Actions */}
                          <div className="flex gap-1 items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditEntry(e)}
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                if (confirm("Delete this clocking entry permanently?")) {
                                  await deleteEntryM.mutateAsync({ id: e.id });
                                }
                              }}
                              disabled={deleteEntryM.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick manual adjust button inside sheet footer */}
          <div className="border-t pt-4 mt-auto">
            <Button
              className="w-full flex items-center justify-center gap-1.5"
              onClick={() => {
                if (selectedAuditEmployee) {
                  setTargetUser(selectedAuditEmployee);
                  setDialogOpen(true);
                }
              }}
            >
              <Clock className="h-4 w-4" /> Add Manual Time Punch
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
