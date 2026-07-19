import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_status",
  title: "Get my clock status",
  description:
    "Returns the signed-in user's current clock status (in or out) and their most recent punch timestamp.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("time_entries")
      .select("type, punched_at")
      .eq("user_id", ctx.getUserId())
      .order("punched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const status = data?.type === "in" ? "clocked_in" : "clocked_out";
    const summary = data
      ? `Currently ${status.replace("_", " ")} since ${data.punched_at}.`
      : "No punches yet.";
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { status, lastEntry: data ?? null },
    };
  },
});
