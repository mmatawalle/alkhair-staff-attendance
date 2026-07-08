
## Goal

Give the shop one browser tab that always displays a fresh QR/code, so nobody prints anything and no admin has to sign in each morning. Employees scan with their phone, tap **Confirm**, and are clocked in/out.

## How it will work day-to-day

1. Admin signs in once at `/kiosk/setup` on the shop computer and taps **Pair this device**.
2. That browser stores a long-lived kiosk token and redirects to `/kiosk`, which stays open full-screen.
3. `/kiosk` shows today's QR + big manual code. Every ~3 minutes the code rotates automatically; the page refreshes to display the new one. No login prompts.
4. An employee scans the QR on their phone → lands on `/clock?code=…` (must be signed in) → sees "Clock IN" / "Clock OUT" button → taps once → confirmation screen.
5. Admin can revoke the paired kiosk anytime from `/admin/staff` (new "Kiosk devices" section) — e.g. if the shop PC is lost.

## What changes

### Database
- New table `kiosk_devices` — id, label (e.g. "Front counter PC"), token (random, unique, indexed), created_by, revoked_at.
  - RLS: admins manage rows; the paired token is used only by an unauthenticated server route (validated server-side), so no anon SELECT.
- `daily_codes` gains `expires_at` (timestamptz) so a code can be valid for a short window instead of the whole day. Existing "one code per day" logic is replaced by "current active code = most recent non-revoked, non-expired code". The `valid_date` column stays for reporting.

### Server functions / routes
- `pairKioskDevice` (admin only): creates a `kiosk_devices` row, returns the token once. Called by `/kiosk/setup`.
- `revokeKioskDevice` (admin only).
- `listKioskDevices` (admin only).
- New public server route `GET /api/public/kiosk/current-code?token=…`:
  - Validates the kiosk token against `kiosk_devices` (not revoked).
  - Returns `{ token, expiresAt }` for the current active `daily_codes` row.
  - If none exists or the latest one is expired, it rotates: inserts a new row with `expires_at = now() + rotation window` and returns that.
  - This is the ONLY endpoint the kiosk page needs — it works without a Supabase login on the shop PC.
- The employee-facing `punchWithCode` server fn already validates the code; it will additionally reject expired/revoked codes.

### Pages
- `/kiosk/setup` (admin, authenticated): "Pair this device" button, optional label input. On success writes the token into `localStorage` under `kiosk_token` and redirects to `/kiosk`.
- `/kiosk` (PUBLIC route, no auth): reads `kiosk_token` from `localStorage`; if missing, tells the user to visit `/kiosk/setup`. Polls the public endpoint above every 20s, renders the QR + manual code, shows a small countdown "New code in 2:14". Full-screen friendly.
- `/clock?code=…` (existing, authenticated): change from auto-punch to a two-step **Confirm Clock IN / Clock OUT** button, then confirmation state.
- `/admin/staff`: add a "Kiosk devices" panel listing paired devices with a Revoke button. The old printable `/admin/display` page stays as a fallback but is no longer the primary flow.

### Rotation
- Rotation window: 3 minutes (configurable constant). Kiosk polls every 20s; when it sees a new token it re-renders the QR.
- No cron job needed — rotation happens lazily inside the public endpoint whenever the current code has expired. This keeps things simple and avoids server-side scheduling.

### Security notes
- The kiosk token grants only "read the current punch code"; it cannot punch, read entries, or see any user data.
- Employees still must be signed in on their own phone to actually punch — the QR alone is worthless without an account.
- Rotating the QR every few minutes means a photograph taken at 9am is unusable by 9:05am, so remote/off-shift punching is prevented in practice.
- Admin can revoke a kiosk instantly; the public endpoint will reject the old token on the next 20s poll.

## Out of scope for this change
- Geolocation / IP restrictions.
- Multiple simultaneous shop locations (the model supports it, but no UI to filter by location yet).
- Native fullscreen / screensaver behaviour on the shop OS — that's a browser setting.
