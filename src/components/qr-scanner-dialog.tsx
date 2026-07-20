import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, X, ShieldAlert, KeyRound } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

type Stage = "intro" | "scanning" | "denied" | "error" | "manual";

// Try to extract the ?code= param if the QR contains a full URL; otherwise
// treat the raw text as the code.
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const c = url.searchParams.get("code");
    if (c) return c;
  } catch {
    // not a URL
  }
  return trimmed;
}

function isPermissionError(err: unknown): boolean {
  const msg = (err as { message?: string; name?: string })?.message ?? "";
  const name = (err as { name?: string })?.name ?? "";
  return (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    /permission|denied|not\s?allowed/i.test(msg)
  );
}

export function QrScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");

  // Reset stage when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStage("intro");
      setErrorMsg(null);
      setManualCode("");
    }
  }, [open]);

  // Start the scanner only when we're in the scanning stage
  useEffect(() => {
    if (!open || stage !== "scanning") return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setErrorMsg(null);
    setStarting(true);

    const scanner = new QrScanner(
      video,
      (result) => {
        const code = extractCode(result.data);
        if (!code) return;
        scanner.stop();
        onDetected(code);
        onOpenChange(false);
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
      },
    );
    scannerRef.current = scanner;

    scanner
      .start()
      .then(() => {
        if (cancelled) scanner.stop();
      })
      .catch((err) => {
        console.error(err);
        if (isPermissionError(err)) {
          setStage("denied");
        } else if (!window.isSecureContext) {
          setStage("error");
          setErrorMsg(
            "Camera access requires a secure (HTTPS) connection. Open this site over HTTPS and try again.",
          );
        } else {
          setStage("error");
          setErrorMsg(
            (err as { message?: string })?.message ??
              "Could not start the camera. Your device may not have one available.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [open, stage, onDetected, onOpenChange]);

  const submitManual = () => {
    const c = manualCode.trim();
    if (!c) return;
    onDetected(c);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Scan shop QR code
          </DialogTitle>
          <DialogDescription>
            {stage === "intro" &&
              "We'll ask your browser for camera access so you can scan the QR on the shop display."}
            {stage === "scanning" && "Point your camera at the QR code on the shop display."}
            {stage === "denied" && "Camera access was blocked."}
            {stage === "error" && "The camera couldn't be started."}
            {stage === "manual" && "Enter today's code from the shop display."}
          </DialogDescription>
        </DialogHeader>

        {stage === "intro" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" /> Camera permission needed
              </p>
              <p className="text-muted-foreground">
                When you tap <span className="font-medium">Allow camera</span>, your browser will
                ask if this site can use the camera. We only use it to read the QR — no video is
                recorded or uploaded.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setStage("manual")}>
                <KeyRound className="h-4 w-4 mr-1" /> Enter code instead
              </Button>
              <Button onClick={() => setStage("scanning")}>
                <Camera className="h-4 w-4 mr-1" /> Allow camera
              </Button>
            </div>
          </div>
        )}

        {stage === "scanning" && (
          <>
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                  Starting camera…
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStage("manual")}>
                <KeyRound className="h-4 w-4 mr-1" /> Enter code instead
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4 mr-1" /> Close
              </Button>
            </div>
          </>
        )}

        {stage === "denied" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-2">
              <p className="font-medium flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" /> Camera permission denied
              </p>
              <p className="text-muted-foreground">
                To scan the QR, allow camera access for this site in your browser settings, then
                try again. On most phones: tap the lock/info icon in the address bar → Site
                settings → Camera → Allow.
              </p>
              <p className="text-muted-foreground">
                No worries — you can also type today's code from the shop display below.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setStage("manual")}>
                <KeyRound className="h-4 w-4 mr-1" /> Enter code instead
              </Button>
              <Button onClick={() => setStage("scanning")}>
                <Camera className="h-4 w-4 mr-1" /> Try camera again
              </Button>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-2">
              <p className="font-medium flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" /> Couldn't start the camera
              </p>
              <p className="text-muted-foreground">
                {errorMsg ?? "Something went wrong starting the camera."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setStage("manual")}>
                <KeyRound className="h-4 w-4 mr-1" /> Enter code instead
              </Button>
              <Button onClick={() => setStage("scanning")}>
                <Camera className="h-4 w-4 mr-1" /> Try again
              </Button>
            </div>
          </div>
        )}

        {stage === "manual" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="manual-code" className="text-sm font-medium">
                Today's code
              </label>
              <Input
                id="manual-code"
                autoFocus
                placeholder="e.g. ABC123"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitManual();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Ask your manager or check the shop display for today's code.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStage("intro")}>
                <Camera className="h-4 w-4 mr-1" /> Use camera instead
              </Button>
              <Button onClick={submitManual} disabled={!manualCode.trim()}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
