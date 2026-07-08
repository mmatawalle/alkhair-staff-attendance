import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, punchClock } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogIn, LogOut, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/clock")({
  validateSearch: (s) => z.object({ code: z.string().optional() }).parse(s),
  component: ClockScan,
});

function ClockScan() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);
  const punch = useServerFn(punchClock);

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isClockedIn = meQ.data?.lastEntry?.type === "in";

  const [result, setResult] = useState<
    null | { ok: true; type: "in" | "out"; at: string } | { ok: false; msg: string }
  >(null);

  const punchM = useMutation({
    mutationFn: () => {
      if (!code) throw new Error("No code in URL. Scan the shop QR again.");
      return punch({ data: { token: code } });
    },
    onSuccess: (res) => {
      setResult({ ok: true, type: res.type, at: res.punched_at });
      toast.success(`Clocked ${res.type === "in" ? "in" : "out"}`);
    },
    onError: (e: any) => {
      setResult({ ok: false, msg: e?.message ?? "Punch failed" });
    },
  });

  useEffect(() => {
    if (!code) {
      toast.error("No code in URL");
      navigate({ to: "/dashboard" });
    }
  }, [code, navigate]);

  if (result?.ok) {
    return (
      <div className="flex items-center justify-center py-10 md:py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              You're clocked {result.type === "in" ? "in" : "out"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              At {format(new Date(result.at), "EEEE, MMM d 'at' p")}.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/dashboard">Home</Link>
              </Button>
              <Button asChild>
                <Link to="/history">My hours</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result && !result.ok) {
    return (
      <div className="flex items-center justify-center py-10 md:py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-6 w-6" /> Couldn't punch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{result.msg}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-10 md:py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            {isClockedIn ? "Ready to clock out?" : "Ready to clock in?"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/30 text-sm">
            <p>
              Hi <span className="font-medium">{meQ.data?.profile?.full_name || "there"}</span> —
              you'll be clocked{" "}
              <span className="font-semibold">{isClockedIn ? "OUT" : "IN"}</span> when you tap
              below.
            </p>
            {meQ.data?.lastEntry && (
              <p className="text-muted-foreground mt-1">
                Last {meQ.data.lastEntry.type}{" "}
                {formatDistanceToNow(new Date(meQ.data.lastEntry.punched_at), {
                  addSuffix: true,
                })}
                .
              </p>
            )}
          </div>

          <Button
            className="w-full h-14 text-lg"
            onClick={() => punchM.mutate()}
            disabled={punchM.isPending || !code}
          >
            {isClockedIn ? (
              <>
                <LogOut className="h-5 w-5 mr-2" /> Confirm clock OUT
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5 mr-2" /> Confirm clock IN
              </>
            )}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link to="/dashboard">Cancel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
