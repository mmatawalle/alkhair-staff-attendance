import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function todayISO(): string {
  // YYYY-MM-DD in UTC. Shop typically operates in one TZ — UTC date is fine
  // for a simple daily-rotation token; admin can regenerate if needed.
  return new Date().toISOString().slice(0, 10);
}

function randomToken(): string {
  // 24-char URL-safe token
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
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

// --- Punch clock with daily code ---
export const punchClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate profile active
    const { data: prof } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.active) throw new Error("Your account is inactive. Ask an admin.");

    // Validate token = today's active code
    const today = todayISO();
    const { data: code, error: codeErr } = await supabase
      .from("daily_codes")
      .select("id, valid_date, revoked_at")
      .eq("token", data.token)
      .maybeSingle();
    if (codeErr) throw new Error(codeErr.message);
    if (!code) throw new Error("Invalid code. Ask the shop admin for today's QR.");
    if (code.revoked_at) throw new Error("This code was revoked. Scan the new one.");
    if (code.valid_date !== today) throw new Error("This code is not for today.");

    // Determine next type: opposite of last entry today (default 'in')
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

    return { type: inserted.type as "in" | "out", punched_at: inserted.punched_at as string };
  });

// --- Admin: today's code (get-or-create) ---
export const getOrCreateTodayCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const today = todayISO();

    const { data: existing, error: exErr } = await supabase
      .from("daily_codes")
      .select("id, token, valid_date, created_at, revoked_at")
      .eq("valid_date", today)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing) return existing;

    const token = randomToken();
    const { data: created, error: insErr } = await supabase
      .from("daily_codes")
      .insert({ token, valid_date: today, created_by: userId })
      .select("id, token, valid_date, created_at, revoked_at")
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

// --- Admin: regenerate today's code ---
export const regenerateTodayCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const today = todayISO();

    // Revoke any active codes for today
    const { error: revErr } = await supabase
      .from("daily_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("valid_date", today)
      .is("revoked_at", null);
    if (revErr) throw new Error(revErr.message);

    const token = randomToken();
    const { data: created, error: insErr } = await supabase
      .from("daily_codes")
      .insert({ token, valid_date: today, created_by: userId })
      .select("id, token, valid_date, created_at, revoked_at")
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

// --- My entries (with optional range) ---
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

// --- Admin: list staff ---
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
      // ignore unique violation
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
