// Supabase client singleton — loaded before auth.js on every page
// IMPORTANT: The anon key below is safe to be public (it's read-only by design).
// However, Row Level Security (RLS) MUST be enabled on all tables:
//   - picks:    users can only read/write their own rows (auth.uid() = user_id)
//   - ratings:  same — user_id policy
//   - profiles: users can read all, but only update their own row
// Without RLS, any visitor can read or overwrite all data.
(function () {
  const URL = 'https://znefvkwurgnmbelxqzwv.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZWZ2a3d1cmdubWJlbHhxend2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNjk3MTYsImV4cCI6MjA5Mjc0NTcxNn0.6Xl4ITBH2kXi1RnYNxdX1aYs5WyjJOU2T0Jwz2wNxi4';
  window._sb = window.supabase.createClient(URL, KEY);
})();
