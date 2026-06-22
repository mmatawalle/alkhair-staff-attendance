import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateTodayCode, regenerateTodayCode } from "@/lib/time.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QRCode from "qrcode";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/display")({
  component: AdminDisplay,
});

function AdminDisplay() {
  const fetchCode = useServerFn(getOrCreateTodayCode);
  const regen = useServerFn(regenerateTodayCode);
  const qc = useQueryClient();
  const codeQ = useQuery({
    queryKey: ["today-code"],
    queryFn: () => fetchCode(),
    refetchInterval: 60_000,
  });
  const regenM = useMutation({
    mutationFn: () => regen(),
    onSuccess: () => {
      toast.success("New code generated");
      qc.invalidateQueries({ queryKey: ["today-code"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const token = codeQ.data?.token;

  useEffect(() => {
    if (!token) return;
    const url = `${window.location.origin}/clock?code=${encodeURIComponent(token)}`;
    QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setDataUrl);
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Shop display</h1>
          <p className="text-sm text-muted-foreground">
            Today: {format(new Date(), "EEEE, MMMM d")}. Employees scan with their phones.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => regenM.mutate()}
          disabled={regenM.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Regenerate code
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center">Scan to clock in / out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {dataUrl ? (
            <img src={dataUrl} alt="Today's QR code" className="w-72 h-72 md:w-96 md:h-96" />
          ) : (
            <div className="w-72 h-72 md:w-96 md:h-96 bg-muted animate-pulse rounded" />
          )}
          {token && (
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Manual code</p>
              <p className="text-3xl font-mono font-semibold tracking-wider select-all">
                {token}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
