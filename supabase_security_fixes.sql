-- ============================================================
-- MMA BRIDGE — Security Advisor fixes (2026-08-06)
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── ERRORS ───────────────────────────────────────────────────
-- fight_results had a policy created on it but RLS itself was never
-- switched on, which means RLS was doing NOTHING — the table was fully
-- open to anyone holding the public anon key (visible in any browser's
-- dev tools). admin.html has been updated in this same change to write
-- results through the backend's /api/admin/set-result endpoint (which
-- uses the service-role key and re-checks the admin password token)
-- instead of writing directly from the client — so it's now safe to
-- lock writes down at the DB level too: public read-only, no client
-- INSERT/UPDATE/DELETE policy at all (service_role bypasses RLS
-- entirely, so the backend keeps working with zero policy needed for it).
alter table public.fight_results enable row level security;

drop policy if exists "fight_results_select" on public.fight_results;
create policy "fight_results_select" on public.fight_results
  for select using (true);

-- Deliberately no insert/update/delete policy for anon/authenticated —
-- only the backend's service-role key can write.


-- ── WARNINGS ─────────────────────────────────────────────────

-- Function Search Path Mutable — an unset search_path on a SECURITY
-- DEFINER function means it resolves unqualified table/type names
-- using whatever search_path the CALLING session happens to have,
-- which a malicious caller could manipulate to redirect the function
-- at objects it wasn't meant to touch. Pin it explicitly.
alter function public.handle_new_user() set search_path = public, pg_temp;

-- Public/Signed-In Can Execute SECURITY DEFINER Function — both
-- handle_new_user() and rls_auto_enable() only need to run as the
-- `on_auth_user_created` trigger (handle_new_user) or as an internal/
-- one-off helper (rls_auto_enable, not referenced anywhere in the
-- frontend or backend code) — neither needs to be directly callable via
-- PostgREST RPC by anon/authenticated. Triggers still fire fine after
-- this: Postgres doesn't check EXECUTE privilege for trigger-invoked
-- calls, only for direct calls (e.g. `select public.handle_new_user()`
-- or supabase.rpc('handle_new_user')).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()  from public, anon, authenticated;

-- Leaked Password Protection Disabled — this one isn't SQL. Enable it at:
-- Supabase Dashboard → Authentication → Policies (or Auth → Settings,
-- depending on dashboard version) → "Leaked password protection" → On.
-- It checks new passwords against HaveIBeenPwned's breach corpus at
-- signup/password-change time — no code change needed.
