import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/kiosk")({
  ssr: false,
  component: KioskDisplay,
});

const STORAGE_KEY = "kiosk_token";
const POLL_MS = 20_000;

type CodeResponse = {
  token: string;
  expiresAt: string;
  rotationSeconds: number;
};

function KioskDisplay() {
  const [kioskToken, setKioskToken] = useState<string | null>(null);
  const [code, setCode] = useState<CodeResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      setKioskToken(t);
    } catch {}
  }, []);

  const fetchCode = async (token: string) => {
    try {
      const res = await fetch(
        `/api/public/kiosk/current-code?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as any;
        setStatus("error");
        setErrorMsg(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as CodeResponse;
      setCode((prev) => {
        if (prev?.token === data.token && prev?.expiresAt === data.expiresAt) return prev;
        return data;
      });
      setStatus("idle");
      setErrorMsg(null);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Network error");
    }
  };

  // Poll for the current code
  useEffect(() => {
    if (!kioskToken) return;
    fetchCode(kioskToken);
    pollRef.current = window.setInterval(() => fetchCode(kioskToken), POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [kioskToken]);

  // Tick for countdown
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // If the code appears expired, fetch immediately (rotation)
  useEffect(() => {
    if (!kioskToken || !code) return;
    const msLeft = new Date(code.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) fetchCode(kioskToken);
  }, [now, code, kioskToken]);

  // Render QR
  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      return;
    }
    const url = `${window.location.origin}/clock?code=${encodeURIComponent(code.token)}`;
    QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: "M" }).then(
      setQrDataUrl,
    );
  }, [code]);

  if (!kioskToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" /> This kiosk isn't paired
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              An admin needs to sign in on this browser once and pair it. After that this page
              will keep showing the QR without any login.
            </p>
            <Button asChild>
              <Link to="/kiosk-setup">Pair this device</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Can't load the code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button asChild variant="outline">
              <Link to="/kiosk-setup">Pair this device again</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const msLeft = code ? new Date(code.expiresAt).getTime() - now : 0;
  const secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = Math.floor(secondsLeft / 60).toString();
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <span className="font-semibold">TimeClock — shop display</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMM d • HH:mm")}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl text-center space-y-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Scan to clock in / out</h1>
            <p className="text-muted-foreground mt-2">
              Point your phone camera at the code below, then confirm.
            </p>
          </div>

          <div className="mx-auto inline-block rounded-2xl border bg-card p-6 shadow-sm">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to clock in or out"
                className="w-[320px] h-[320px] md:w-[440px] md:h-[440px]"
              />
            ) : (
              <div className="w-[320px] h-[320px] md:w-[440px] md:h-[440px] bg-muted animate-pulse rounded" />
            )}
          </div>

          {code && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Or enter this code
              </p>
              <p className="text-4xl md:text-5xl font-mono font-semibold tracking-widest select-all">
                {code.token}
              </p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-2">
                <RefreshCw className="h-3 w-3" />
                New code in {mm}:{ss}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
