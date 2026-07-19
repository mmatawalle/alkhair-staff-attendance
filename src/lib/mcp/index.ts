import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyStatus from "./tools/get-my-status";
import listMyEntries from "./tools/list-my-entries";
import listTeamHoursToday from "./tools/list-team-hours-today";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "timeclock-mcp",
  title: "TimeClock",
  version: "0.1.0",
  instructions:
    "Tools for the TimeClock staff attendance app. Use `get_my_status` to check the signed-in user's current clock status, `list_my_entries` to see their recent punches, and `list_team_hours_today` (admin only) for a same-day team summary.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyStatus, listMyEntries, listTeamHoursToday],
});
