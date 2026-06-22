# Employee Time Tracker — Plan

A web app where employees sign in on their phones, scan a daily shop QR code to clock in/out, and admins manage staff and view team hours.

## Core flows

**Employee**
- Sign up / log in with email + password
- Home screen shows current status (Clocked in/out) and big "Scan QR" button
- Scan the shop's daily QR → records clock-in (or clock-out if already in) with timestamp
- View own log: today, this week, this month, total hours

**Admin**
- Same login, with admin role
- "Shop Display" page: shows today's QR code full-screen for the shop computer; auto-rotates daily at midnight; "Regenerate now" button invalidates the current code and issues a new one
- Team dashboard: all employees, hours per day/week, currently clocked-in list, CSV export
- Manage employees: promote to admin, deactivate

## Verification logic

- One active `daily_code` row per day (UUID token encoded in QR)
- Auto-generated on first request of the day; admin can force-regenerate (marks previous invalid, creates new)
- Clock-in/out server function validates: token matches today's active code, not expired, employee is active
- QR encodes a URL like `/clock?code=<token>` — opening on phone (already logged in) triggers the punch and shows confirmation

## Tech / backend (Lovable Cloud)

- Auth: email + password
- Tables (all RLS-enabled, in `public` with proper GRANTs):
  - `profiles` (id → auth.users, full_name, active)
  - `user_roles` (user_id, role enum: admin/employee) + `has_role()` security-definer function
  - `daily_codes` (id, token, valid_date, created_at, revoked_at, created_by)
  - `time_entries` (id, user_id, type: in/out, timestamp, daily_code_id)
- RLS:
  - Employees: select/insert own time_entries; select own profile
  - Admins: select all profiles, time_entries, daily_codes; insert/update daily_codes; manage roles
  - daily_codes select allowed to authenticated (needed to validate scans)
- Server functions (`createServerFn` + `requireSupabaseAuth`):
  - `getOrCreateTodayCode` (admin)
  - `regenerateTodayCode` (admin)
  - `punchClock({ token })` — validates + inserts in/out
  - `getMyEntries`, `getTeamEntries` (admin)

## Routes

Public: `/`, `/auth`
Authenticated (`_authenticated/`):
- `/` employee home (status + scan button + recent entries)
- `/clock?code=...` handles scan, redirects to home with toast
- `/history` personal hours
- `/admin/display` shop QR full-screen (admin only)
- `/admin/team` team dashboard + CSV export
- `/admin/staff` employee management

Admin sub-routes gated by `has_role` check in loader; non-admins redirected.

## UI

- Mobile-first, large tap targets
- QR generation via `qrcode` npm package
- Camera scanning via the URL-based approach (employee taps QR image rendered as a link on the shop screen, or uses phone's native camera which opens the URL) — no in-app scanner library needed

## First-admin bootstrap

First registered user is auto-promoted to admin via a one-time DB trigger (only if no admin exists yet). Subsequent users default to employee role; admins can promote others.

## Out of scope (ask if needed)

- Geofencing, payroll export beyond CSV, shift scheduling, break tracking, offline mode
