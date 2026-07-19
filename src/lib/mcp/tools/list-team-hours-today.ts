import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function computeHours(entries: Array<{ type: string; punched_at: string }>): number {
  let total = 0;
  let openIn: number | null = null;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );
  for (const e of sorted) {
    const t = new Date(e.punched_at).getTime();
    if (e.type === "in") openIn = t;
    else if (e.type === "out" && openIn != null) {
      total += t - openIn;
      openIn = null;
    }
  }
  if (openIn != null) total += Date.now() - openIn;
  return Math.round((total / 3_600_000) * 100) / 100;
}

export default defineTool({
  name: "list_team_hours_today",
  title: "List team hours today (admin)",
  description:
    "Admin only. Returns hours worked today for every staff member, based on today's clock-in / clock-out entries.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD) to report on. Defaults to today (UTC)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: adminRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.getUserId())
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) {
      return { content: [{ type: "text", text: roleErr.message }], isError: true };
    }
    if (!adminRow) {
      return { content: [{ type: "text", text: "Forbidden: admin only" }], isError: true };
    }

    const day = date ?? new Date().toISOString().slice(0, 10);
    const start = `${day}T00:00:00.000Z`;
    const end = `${day}T23:59:59.999Z`;

    const { data: entries, error } = await supabase
      .from("time_entries")
      .select("user_id, type, punched_at")
      .gte("punched_at", start)
      .lte("punched_at", end);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email");
    const nameById = new Map<string, { name: string; email: string }>();
    for (const p of profiles ?? []) {
      nameById.set(p.id as string, {
        name: (p.full_name as string) ?? "",
        email: (p.email as string) ?? "",
      });
    }

    const byUser = new Map<string, Array<{ type: string; punched_at: string }>>();
    for (const e of entries ?? []) {
      const list = byUser.get(e.user_id as string) ?? [];
      list.push({ type: e.type as string, punched_at: e.punched_at as string });
      byUser.set(e.user_id as string, list);
    }

    const rows = Array.from(byUser.entries()).map(([userId, list]) => ({
      userId,
      name: nameById.get(userId)?.name ?? "",
      email: nameById.get(userId)?.email ?? "",
      hours: computeHours(list),
      punches: list.length,
    }));
    rows.sort((a, b) => b.hours - a.hours);

    return {
      content: [{ type: "text", text: JSON.stringify({ date: day, rows }, null, 2) }],
      structuredContent: { date: day, rows },
    };
  },
});
