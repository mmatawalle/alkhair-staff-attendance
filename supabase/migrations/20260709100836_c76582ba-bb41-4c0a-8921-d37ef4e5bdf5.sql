DROP POLICY IF EXISTS "Read today's codes" ON public.daily_codes;
CREATE POLICY "Admins read codes" ON public.daily_codes FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete time entries" ON public.time_entries FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));