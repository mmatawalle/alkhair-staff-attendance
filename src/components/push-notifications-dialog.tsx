import { useEffect, useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing, CheckCircle2, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { registerPushDevice, sendTestPush } from "@/lib/time.functions";

type Stage = "intro" | "requesting" | "granted" | "denied" | "blocked-iframe" | "unsupported" | "error";

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function withOneSignal(cb: (OneSignal: any) => void) {
  const q = ((window as any).OneSignalDeferred = (window as any).OneSignalDeferred || []);
  q.push(cb);
}

export function PushNotificationsButton() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("intro");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [subscribed, setSubscribed] = useState(false);
  const [ready, setReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const registerDevice = useServerFn(registerPushDevice);
  const testPush = useServerFn(sendTestPush);
  const registeredRef = useRef<string | null>(null);

  // Save this device's OneSignal subscription id so the server can target admins.
  const saveDevice = useCallback(
    async (subscriptionId?: string | null) => {
      if (!subscriptionId || registeredRef.current === subscriptionId) return;
      registeredRef.current = subscriptionId;
      try {
        await registerDevice({
          data: { subscriptionId, userAgent: navigator.userAgent.slice(0, 500) },
        });
      } catch (e: any) {
        registeredRef.current = null;
        console.error("Failed to register push device", e);
        throw e;
      }
    },
    [registerDevice],
  );

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const res: any = await (testPush as any)();
      if (res?.sent) {
        toast.success(`Test notification sent to ${res.recipients} device(s).`);
      } else {
        toast.error(res?.error ?? "Could not send the test notification.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the test notification.");
    } finally {
      setTesting(false);
    }
  }, [testPush]);


  // Track subscription state from the OneSignal SDK
  useEffect(() => {
    if (typeof window === "undefined") return;
    let interval: ReturnType<typeof setInterval> | undefined;
    withOneSignal((OneSignal: any) => {
      setReady(true);
      const check = () => {
        const sub = OneSignal.User?.PushSubscription ?? OneSignal.User?.pushSubscription;
        if (!sub) return false;
        setSubscribed(Boolean(sub.optedIn));
        if (sub.optedIn && sub.id) void saveDevice(sub.id).catch(() => {});
        sub.addEventListener?.("change", (event: any) => {
          const cur = event?.current;
          setSubscribed(Boolean(cur?.optedIn));
          if (cur?.optedIn && cur?.id) void saveDevice(cur.id).catch(() => {});
        });
        return true;
      };

      if (!check()) {
        interval = setInterval(() => {
          if (check() && interval) clearInterval(interval);
        }, 500);
      }
    });
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const openDialog = useCallback(() => {
    setErrorMsg("");
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStage("unsupported");
    } else if (Notification.permission === "granted") {
      setStage("granted");
    } else if (Notification.permission === "denied") {
      setStage(isInIframe() ? "blocked-iframe" : "denied");
    } else if (isInIframe()) {
      setStage("blocked-iframe");
    } else {
      setStage("intro");
    }
    setOpen(true);
  }, []);

  const request = useCallback(async () => {
    setStage("requesting");
    setErrorMsg("");
    try {
      // Ask the browser directly so the native prompt is tied to this click.
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStage("denied");
        return;
      }
      if (permission !== "granted") {
        setStage("intro");
        toast.info("Notification prompt dismissed — you can try again anytime.");
        return;
      }
      // Permission granted: opt the device into OneSignal push.
      if (!ready) {
        setErrorMsg(
          "Notification permission was granted, but the push service hasn't loaded yet. Reload the page and try again.",
        );
        setStage("error");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out while registering this device.")), 15000);
        withOneSignal(async (OneSignal: any) => {
          try {
            await OneSignal.Notifications?.requestPermission?.();
            const sub = OneSignal.User?.PushSubscription ?? OneSignal.User?.pushSubscription;
            await sub?.optIn?.();
            clearTimeout(timeout);
            resolve();
          } catch (e: any) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      });
      setSubscribed(true);
      setStage("granted");
      toast.success("Phone notifications enabled on this device.");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Something went wrong while enabling notifications.");
      setStage("error");
    }
  }, [ready]);

  const openInNewTab = () => {
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  };

  const label = subscribed ? "Notifications on" : "Enable phone notifications";

  return (
    <>
      <button
        onClick={openDialog}
        className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 font-medium transition-all ${
          subscribed
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            : "bg-sky-500/10 text-sky-600 border-sky-500/20 hover:bg-sky-500/20"
        }`}
      >
        {subscribed ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />} {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {stage === "intro" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-sky-600" /> Turn on punch alerts
                </DialogTitle>
                <DialogDescription>
                  Your browser will ask for permission to show notifications. Choose <strong>Allow</strong> so this
                  device gets an alert whenever a staff member clocks in or out.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Not now
                </Button>
                <Button onClick={request}>Allow notifications</Button>
              </DialogFooter>
            </>
          )}

          {stage === "requesting" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Waiting for your answer
                </DialogTitle>
                <DialogDescription>
                  Respond to the browser prompt at the top of the window, then this device gets registered
                  automatically.
                </DialogDescription>
              </DialogHeader>
            </>
          )}

          {stage === "granted" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> Notifications are on
                </DialogTitle>
                <DialogDescription>
                  {subscribed
                    ? "This device is registered. You'll get a push the next time someone clocks in or out."
                    : "Permission is granted. Finishing device registration — if you don't get alerts, reload this page once."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          )}

          {stage === "denied" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <BellOff className="h-5 w-5" /> Notifications are blocked
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>Your browser is blocking notifications for this site. To re-enable:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Tap the lock / settings icon next to the address bar.</li>
                      <li>
                        Open <strong>Site settings</strong> → <strong>Notifications</strong>.
                      </li>
                      <li>
                        Switch it to <strong>Allow</strong>, then reload this page.
                      </li>
                    </ol>
                    <p className="text-muted-foreground">
                      On iPhone, Safari also requires adding this site to your Home Screen first.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => window.location.reload()}>Reload page</Button>
              </DialogFooter>
            </>
          )}

          {stage === "blocked-iframe" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" /> Open in a real browser tab
                </DialogTitle>
                <DialogDescription>
                  Browsers don't allow notification prompts inside an embedded preview. Open this page in its own tab,
                  then tap <strong>Enable phone notifications</strong> again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={openInNewTab}>
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Open in new tab
                </Button>
              </DialogFooter>
            </>
          )}

          {stage === "unsupported" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> This browser can't do push
                </DialogTitle>
                <DialogDescription>
                  Web push needs a secure (https) page and a modern browser. Try Chrome on Android or, on iPhone, add
                  this site to your Home Screen and open it from there.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}

          {stage === "error" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Couldn't finish setup
                </DialogTitle>
                <DialogDescription>{errorMsg || "Something went wrong. Please try again."}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={request}>Try again</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
