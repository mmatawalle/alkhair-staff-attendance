
-- 1. kiosk_devices
CREATE TABLE public.kiosk_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
);
CREATE INDEX kiosk_devices_active_token_idx
  ON public.kiosk_devices(token) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_devices TO authenticated;
GRANT ALL ON public.kiosk_devices TO service_role;

ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read kiosk devices" ON public.kiosk_devices
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert kiosk devices" ON public.kiosk_devices
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update kiosk devices" ON public.kiosk_devices
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete kiosk devices" ON public.kiosk_devices
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- 2. daily_codes.expires_at
ALTER TABLE public.daily_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Widen SELECT so employees can validate their scanned code even if it just expired
-- (gives a proper "expired, scan the new one" error instead of a generic 'invalid').
DROP POLICY IF EXISTS "Read today's active code" ON public.daily_codes;
DROP POLICY IF EXISTS "Read active code" ON public.daily_codes;
CREATE POLICY "Read today's codes" ON public.daily_codes FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR valid_date = CURRENT_DATE
  );
