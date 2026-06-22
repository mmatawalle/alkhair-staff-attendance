import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyEntries } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfWeek, isSameWeek } from "date-fns";
import { LogIn, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Entry = { id: string; type: "in" | "out"; punched_at: string };

function computeHours(entries: Entry[]): number {
  // Pair ins with the next out chronologically.
  const sorted = [...entries].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );
  let total = 0;
  let openIn: Date | null = null;
  for (const e of sorted) {
    const t = new Date(e.punched_at);
    if (e.type === "in") {
      openIn = t;
    } else if (e.type === "out" && openIn) {
      total += (t.getTime() - openIn.getTime()) / 3_600_000;
      openIn = null;
    }
  }
  return total;
}

function HistoryPage() {
  const fetchEntries = useServerFn(getMyEntries);
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["my-entries", days],
    queryFn: () => fetchEntries({ data: { days } }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of (q.data ?? []) as Entry[]) {
      const key = format(new Date(e.punched_at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [q.data]);

  const totals = useMemo(() => {
    const entries = (q.data ?? []) as Entry[];
    const now = new Date();
    const thisWeek = entries.filter((e) =>
      isSameWeek(new Date(e.punched_at), now, { weekStartsOn: 1 }),
    );
    return {
      week: computeHours(thisWeek),
      period: computeHours(entries),
    };
  }, [q.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">My hours</h1>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">This week</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.week.toFixed(1)}h</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Last {days} days</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.period.toFixed(1)}h</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Punch log</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No punches in this range.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, items]) => (
                <div key={day}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium">{format(new Date(day), "EEEE, MMM d")}</h3>
                    <span className="text-sm text-muted-foreground">
                      {computeHours(items).toFixed(1)}h
                    </span>
                  </div>
                  <ul className="divide-y border rounded-md">
                    {items.map((e) => (
                      <li key={e.id} className="px-3 py-2 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {e.type === "in" ? (
                            <LogIn className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <LogOut className="h-4 w-4 text-amber-600" />
                          )}
                          <span className="capitalize">{e.type}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(e.punched_at), "p")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
