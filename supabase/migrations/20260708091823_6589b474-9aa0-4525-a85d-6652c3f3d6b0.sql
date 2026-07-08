
-- Move has_role out of the public (API-exposed) schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Recreate policies to use private.has_role
-- profiles
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins insert profiles" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- user_roles
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- time_entries
DROP POLICY IF EXISTS "Users view own entries" ON public.time_entries;
CREATE POLICY "Users view own entries" ON public.time_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- daily_codes: restrict reads to today's non-revoked code for non-admins; admins see all
DROP POLICY IF EXISTS "Authenticated read codes" ON public.daily_codes;
DROP POLICY IF EXISTS "Admins insert codes" ON public.daily_codes;
DROP POLICY IF EXISTS "Admins update codes" ON public.daily_codes;
CREATE POLICY "Read today's active code" ON public.daily_codes FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR (valid_date = CURRENT_DATE AND revoked_at IS NULL)
  );
CREATE POLICY "Admins insert codes" ON public.daily_codes FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update codes" ON public.daily_codes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- Remove the API-exposed has_role from public
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
