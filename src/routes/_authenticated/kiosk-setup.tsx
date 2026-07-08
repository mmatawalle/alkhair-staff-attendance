import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listKioskDevices,
  pairKioskDevice,
  revokeKioskDevice,
} from "@/lib/time.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Monitor, ShieldCheck, Trash2 } from "lucide-react";
import { format } from "date-fns";

export const KIOSK_TOKEN_STORAGE_KEY = "kiosk_token";

export const Route = createFileRoute("/_authenticated/kiosk-setup")({
  component: KioskSetup,
});

function KioskSetup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listKioskDevices);
  const pair = useServerFn(pairKioskDevice);
  const revoke = useServerFn(revokeKioskDevice);

  const [label, setLabel] = useState("Shop computer");
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);

  useEffect(() => {
    // Detect if this browser already has a token
    try {
      const t = localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY);
      // We don't know its id without a lookup, but we can note it is paired.
      if (t) setThisDeviceId("paired");
    } catch {}
  }, []);

  const devicesQ = useQuery({
    queryKey: ["kiosk-devices"],
    queryFn: () => list(),
  });

  const pairM = useMutation({
    mutationFn: (v: { label: string }) => pair({ data: v }),
    onSuccess: (row: any) => {
      try {
        localStorage.setItem(KIOSK_TOKEN_STORAGE_KEY, row.token);
      } catch {}
      toast.success("This computer is now paired.");
      qc.invalidateQueries({ queryKey: ["kiosk-devices"] });
      navigate({ to: "/kiosk" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not pair"),
  });

  const revokeM = useMutation({
    mutationFn: (v: { id: string }) => revoke({ data: v }),
    onSuccess: () => {
      toast.success("Device revoked");
      qc.invalidateQueries({ queryKey: ["kiosk-devices"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not revoke"),
  });

  const openKiosk = () => navigate({ to: "/kiosk" });
  const unpairThisDevice = () => {
    try {
      localStorage.removeItem(KIOSK_TOKEN_STORAGE_KEY);
    } catch {}
    setThisDeviceId(null);
    toast.success("This browser is unpaired locally. Revoke the device below to fully deactivate it.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Monitor className="h-6 w-6" /> Shop kiosk
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pair the shop computer once. It will stay showing today's rotating QR — no daily
          printing, no login every morning.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pair this computer</CardTitle>
          <CardDescription>
            Do this once, on the shop's browser. This browser will then remember its kiosk key
            and can open <span className="font-mono">/kiosk</span> without login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {thisDeviceId ? (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <p className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                This browser is already paired.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openKiosk}>Open kiosk</Button>
                <Button variant="outline" onClick={unpairThisDevice}>
                  Unpair this browser
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Label (e.g. Front counter PC)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button
                onClick={() => pairM.mutate({ label: label.trim() || "Shop computer" })}
                disabled={pairM.isPending}
              >
                Pair this device
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paired devices</CardTitle>
          <CardDescription>Revoke any device you no longer want to display the QR.</CardDescription>
        </CardHeader>
        <CardContent>
          {devicesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (devicesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices paired yet.</p>
          ) : (
            <ul className="divide-y border rounded-md">
              {(devicesQ.data ?? []).map((d: any) => (
                <li key={d.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{d.label || "Unnamed device"}</div>
                    <div className="text-xs text-muted-foreground">
                      Paired {format(new Date(d.created_at), "MMM d, yyyy")}
                      {d.last_seen_at
                        ? ` • last seen ${format(new Date(d.last_seen_at), "MMM d, p")}`
                        : " • never used"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.revoked_at ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Badge>Active</Badge>
                    )}
                    {!d.revoked_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeM.mutate({ id: d.id })}
                        disabled={revokeM.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
