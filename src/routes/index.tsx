import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Clock, QrCode, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TimeClock — Employee time tracking" },
      { name: "description", content: "QR-based employee clock in / clock out with a daily code and a simple team dashboard." },
      { property: "og:title", content: "TimeClock — Employee time tracking" },
      { property: "og:description", content: "QR-based employee clock in / clock out with a daily code and a simple team dashboard." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium mb-6">
          <Clock className="h-4 w-4" /> TimeClock
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Clock in with a scan. Track hours effortlessly.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          Display a daily QR code at the shop. Employees scan with their phones to
          clock in and out. Admins get a live team overview.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Create account</Link>
          </Button>
        </div>

        <div className="mt-16 grid sm:grid-cols-3 gap-4 text-left">
          <Feature icon={<QrCode className="h-5 w-5" />} title="Daily QR code" body="Auto-rotates each day. Regenerate any time." />
          <Feature icon={<Clock className="h-5 w-5" />} title="One-tap punch" body="Scan with the phone camera — that's it." />
          <Feature icon={<Users className="h-5 w-5" />} title="Team dashboard" body="See who's in, weekly hours, export CSV." />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 font-medium">{icon}{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
