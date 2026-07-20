import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

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

export function QrScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setError(null);
    setStarting(true);

    const scanner = new QrScanner(
      video,
      (result) => {
        const code = extractCode(result.data);
        if (!code) return;
        // Fire once and close
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
        setError(
          err?.message?.includes("Permission")
            ? "Camera permission denied. Enable camera access in your browser settings."
            : "Could not start the camera. Make sure your device has one and this site is served over HTTPS.",
        );
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
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Scan shop QR code
          </DialogTitle>
          <DialogDescription>
            Point your camera at the QR code on the shop display.
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Starting camera…
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
