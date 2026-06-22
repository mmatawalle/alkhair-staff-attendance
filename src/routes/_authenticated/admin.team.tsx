import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTeamEntries } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { format, isSameDay, isSameWeek } from "date-fns";
import { Download } from "lucide-react";

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
  const [days, setDays] = useState(14);
  const q = useQuery({
    queryKey: ["team-entries", days],
    queryFn: () => fetchTeam({ data: { days } }),
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Team dashboard</h1>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
