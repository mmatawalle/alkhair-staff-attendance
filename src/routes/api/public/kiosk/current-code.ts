import { createFileRoute } from "@tanstack/react-router";

const ROTATION_SECONDS = 180;

function randomToken(): string {
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export const Route = createFileRoute("/api/public/kiosk/current-code")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ??
          request.headers.get("x-kiosk-token") ??
          "";
        if (!token || token.length < 8) {
          return json({ error: "Missing kiosk token" }, { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Validate kiosk
        const { data: device, error: devErr } = await (supabaseAdmin as any)
          .from("kiosk_devices")
          .select("id, revoked_at")
          .eq("token", token)
          .maybeSingle();
        if (devErr) return json({ error: devErr.message }, { status: 500 });
        if (!device || device.revoked_at) {
          return json({ error: "Kiosk not paired or revoked" }, { status: 401 });
        }

        // Best-effort last-seen update
        (supabaseAdmin as any)
          .from("kiosk_devices")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", device.id)
          .then(() => {})
          .catch(() => {});

        const nowIso = new Date().toISOString();

        // Get current active code
        const { data: existing } = await (supabaseAdmin as any)
          .from("daily_codes")
          .select("id, token, expires_at, valid_date")
          .is("revoked_at", null)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          return json({
            token: existing.token,
            expiresAt: existing.expires_at,
            rotationSeconds: ROTATION_SECONDS,
          });
        }

        // Rotate: insert a fresh code
        const newToken = randomToken();
        const expiresAt = new Date(
          Date.now() + ROTATION_SECONDS * 1000,
        ).toISOString();
        const { data: created, error: insErr } = await (supabaseAdmin as any)
          .from("daily_codes")
          .insert({
            token: newToken,
            valid_date: todayISO(),
            expires_at: expiresAt,
          })
          .select("token, expires_at")
          .single();
        if (insErr) return json({ error: insErr.message }, { status: 500 });

        return json({
          token: created.token,
          expiresAt: created.expires_at,
          rotationSeconds: ROTATION_SECONDS,
        });
      },
    },
  },
});
