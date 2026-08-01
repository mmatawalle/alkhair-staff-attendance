// Server-only OneSignal helpers. Never imported from client code.

type SendResult = { sent: boolean; recipients: number; error?: string };

function creds() {
  const appId = process.env["ONESIGNAL_APP_ID"] || process.env["VITE_ONESIGNAL_APP_ID"];
  const apiKey = process.env["ONESIGNAL_REST_API_KEY"];
  return { appId, apiKey };
}

/** Subscription ids for every admin device registered in push_devices. */
export async function getAdminSubscriptionIds(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins, error: roleErr } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (roleErr) {
    console.error("[push] failed to load admin roles:", roleErr.message);
    return [];
  }
  const ids = (admins ?? []).map((r: any) => r.user_id as string);
  if (ids.length === 0) return [];

  const { data: devices, error: devErr } = await (supabaseAdmin as any)
    .from("push_devices")
    .select("subscription_id")
    .in("user_id", ids);
  if (devErr) {
    console.error("[push] failed to load push devices:", devErr.message);
    return [];
  }
  return Array.from(new Set((devices ?? []).map((d: any) => d.subscription_id as string))).filter(
    Boolean,
  ) as string[];
}

/** Send a push to specific OneSignal subscription ids. Awaited, with a timeout. */
export async function sendPushToSubscriptions(
  subscriptionIds: string[],
  title: string,
  message: string,
  url?: string,
): Promise<SendResult> {
  const { appId, apiKey } = creds();
  if (!appId || !apiKey) {
    console.error("[push] missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY");
    return { sent: false, recipients: 0, error: "Push is not configured on the server." };
  }
  if (subscriptionIds.length === 0) {
    return {
      sent: false,
      recipients: 0,
      error: "No admin device has notifications enabled yet.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_subscription_ids: subscriptionIds,
        headings: { en: title },
        contents: { en: message },
        ...(url ? { web_url: url } : {}),
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.errors) {
      const err =
        (Array.isArray(body?.errors) ? body.errors.join(", ") : body?.errors?.invalid_player_ids) ||
        body?.errors ||
        `OneSignal returned ${res.status}`;
      console.error("[push] send failed:", res.status, JSON.stringify(body));
      return { sent: false, recipients: 0, error: String(err) };
    }
    const recipients = Number(body?.recipients ?? 0);
    console.log(`[push] sent "${title}" to ${recipients} recipient(s)`);
    return { sent: recipients > 0, recipients };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timed out contacting the push service." : e?.message;
    console.error("[push] send error:", msg);
    return { sent: false, recipients: 0, error: msg ?? "Unknown push error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyAdmins(
  title: string,
  message: string,
  url?: string,
): Promise<SendResult> {
  const ids = await getAdminSubscriptionIds();
  return sendPushToSubscriptions(ids, title, message, url);
}
