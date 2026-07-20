import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Rotation window for the shop-display QR (seconds).
export const CODE_ROTATION_SECONDS = 180;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomToken(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// --- Me: profile + role + last entry ---
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profileRes, rolesRes, lastRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("time_entries")
        .select("id, type, punched_at")
        .eq("user_id", userId)
        .order("punched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);
    return {
      profile: profileRes.data,
      isAdmin: roles.includes("admin"),
      isEmployee: roles.includes("employee") || roles.includes("admin"),
      lastEntry: lastRes.data ?? null,
    };
  });

// --- Punch clock with rotating code ---
export const punchClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prof } = await supabase
      .from("profiles")
      .select("active, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.active) throw new Error("Your account is inactive. Ask an admin.");

    const today = todayISO();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: code, error: codeErr } = await (supabaseAdmin as any)
      .from("daily_codes")
      .select("id, valid_date, revoked_at, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (codeErr) throw new Error("Invalid code. Scan the shop's QR again.");
    if (!code) throw new Error("Invalid code. Scan the shop's QR again.");
    if (code.revoked_at) throw new Error("This code was revoked. Scan the new one.");
    if (code.valid_date !== today) throw new Error("This code is not for today.");
    if (code.expires_at && new Date(code.expires_at).getTime() < Date.now()) {
      throw new Error("This code has expired. Scan the new one at the shop.");
    }

    const { data: last } = await supabase
      .from("time_entries")
      .select("type")
      .eq("user_id", userId)
      .order("punched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextType: "in" | "out" = last?.type === "in" ? "out" : "in";

    const { data: inserted, error: insErr } = await supabase
      .from("time_entries")
      .insert({ user_id: userId, type: nextType, daily_code_id: code.id })
      .select("id, type, punched_at")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Send Push Notification asynchronously via OneSignal
    const onesignalAppId = process.env.VITE_ONESIGNAL_APP_ID;
    const onesignalApiKey = process.env.ONESIGNAL_REST_API_KEY;
    if (onesignalAppId && onesignalApiKey) {
      const name = prof?.full_name || "An employee";
      const action = inserted.type === "in" ? "CLOCKED IN" : "CLOCKED OUT";
      const timeStr = new Date(inserted.punched_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const title = "Attendance Alert";
      const message = `${name} has ${action} at ${timeStr}.`;

      fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Basic ${onesignalApiKey}`,
        },
        body: JSON.stringify({
          app_id: onesignalAppId,
          included_segments: ["Subscribed Users"],
          headings: { en: title },
          contents: { en: message },
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error("Failed to send OneSignal push notification, status:", res.status);
          }
        })
        .catch((err) => {
          console.error("Error sending OneSignal push notification:", err);
        });
    }

    return { type: inserted.type as "in" | "out", punched_at: inserted.punched_at as string };
  });

// --- Admin: get current active code (fallback for old /admin/display page) ---
export const getOrCreateTodayCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    const { data: existing } = await supabase
      .from("daily_codes")
      .select("id, token, valid_date, created_at, revoked_at, expires_at")
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing;

    const token = randomToken();
    const expiresAt = new Date(Date.now() + CODE_ROTATION_SECONDS * 1000).toISOString();
    const { data: created, error: insErr } = await supabase
      .from("daily_codes")
      .insert({ token, valid_date: todayISO(), created_by: userId, expires_at: expiresAt })
      .select("id, token, valid_date, created_at, revoked_at, expires_at")
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

// --- Admin: force-regenerate (revoke current + issue new) ---
export const regenerateTodayCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;

    const { error: revErr } = await supabase
      .from("daily_codes")
      .update({ revoked_at: new Date().toISOString() })
      .is("revoked_at", null);
    if (revErr) throw new Error(revErr.message);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + CODE_ROTATION_SECONDS * 1000).toISOString();
    const { data: created, error: insErr } = await supabase
      .from("daily_codes")
      .insert({ token, valid_date: todayISO(), created_by: userId, expires_at: expiresAt })
      .select("id, token, valid_date, created_at, revoked_at, expires_at")
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

// --- My entries ---
export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await supabase
      .from("time_entries")
      .select("id, type, punched_at")
      .eq("user_id", userId)
      .gte("punched_at", since)
      .order("punched_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// --- Admin: team entries ---
export const getTeamEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ days: z.number().int().min(1).max(365).default(14) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const [entriesRes, profilesRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, user_id, type, punched_at")
        .gte("punched_at", since)
        .order("punched_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, active"),
    ]);
    if (entriesRes.error) throw new Error(entriesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    return { entries: entriesRes.data ?? [], profiles: profilesRes.data ?? [] };
  });

// --- Admin: staff list ---
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, active, created_at").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }
    return (profilesRes.data ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
    }));
  });

// --- Admin: toggle admin role ---
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), makeAdmin: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    if (data.user_id === userId && !data.makeAdmin) {
      throw new Error("You can't remove your own admin role.");
    }
    if (data.makeAdmin) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: data.user_id, role: "admin" });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// --- Admin: toggle active ---
export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Kiosk devices — one paired shop computer per row.
// ============================================================

export const listKioskDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data, error } = await (supabase as any)
      .from("kiosk_devices")
      .select("id, label, created_at, revoked_at, last_seen_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const pairKioskDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ label: z.string().max(80).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const token = randomToken(24); // longer for kiosk
    const { data: row, error } = await (supabase as any)
      .from("kiosk_devices")
      .insert({
        label: data.label ?? "Shop computer",
        token,
        created_by: userId,
      })
      .select("id, label, token, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeKioskDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("kiosk_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createManualPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        type: z.enum(["in", "out"]),
        customTime: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const insertedTime = data.customTime ? new Date(data.customTime).toISOString() : new Date().toISOString();

    const { data: inserted, error } = await (supabaseAdmin as any)
      .from("time_entries")
      .insert({
        user_id: data.targetUserId,
        type: data.type,
        punched_at: insertedTime,
      })
      .select("id, type, punched_at")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });
