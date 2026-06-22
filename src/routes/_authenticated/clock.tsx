import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { punchClock } from "@/lib/time.functions";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/clock")({
  validateSearch: (s) => z.object({ code: z.string().optional() }).parse(s),
  component: ClockScan,
});

function ClockScan() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const punch = useServerFn(punchClock);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!code) {
        toast.error("No code in URL");
        navigate({ to: "/" });
        return;
      }
      try {
        const res = await punch({ data: { token: code } });
        toast.success(`Clocked ${res.type === "in" ? "in" : "out"}!`);
      } catch (err: any) {
        toast.error(err.message ?? "Punch failed");
      } finally {
        navigate({ to: "/" });
      }
    })();
  }, [code, navigate, punch]);

  return (
    <div className="flex items-center justify-center py-16">
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Processing your punch…</p>
        </CardContent>
      </Card>
    </div>
  );
}
