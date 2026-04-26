// ==============================================
// MMA BRIDGE — AUTH MODULE (Supabase)
// ==============================================

(function () {
  const sb = window._sb;

  // Guard: if Supabase CDN failed to load, still render Sign In/Sign Up
  if (!sb) {
    document.addEventListener('DOMContentLoaded', () => renderNavAuth(null));
    return;
  }

  let _session = null;
  let _profile = null;

  function apiBase() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  function getToken() { return _session?.access_token || null; }
  function getUser()  { return _profile || null; }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.MMABridgeAuth = {
    getToken,
    getUser,
    apiBase,
    authHeaders: () => {
      const t = getToken();
      return t ? { 'Authorization': `Bearer ${t}` } : {};
    },
    signOut: async () => {
      await sb.auth.signOut();
      location.reload();
    },
    signInWithEmail: (email, password) =>
      sb.auth.signInWithPassword({ email, password }),
    signUpWithEmail: (email, password, displayName) =>
      sb.auth.signUp({ email, password, options: { data: { full_name: displayName } } }),
    signInWithGoogle: () =>
      sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth.html' }
      }),
    resetPassword: (email) =>
      sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + '/auth.html'
      }),
    updatePassword: (newPassword) =>
      sb.auth.updateUser({ password: newPassword }),
    getSupabase: () => sb
  };

  // ── Navbar rendering ──────────────────────────
  function renderNavAuth(user) {
    document.querySelectorAll('.nav-auth').forEach(el => {
      if (user) {
        el.innerHTML = `
          <div class="nav-user" id="navUser_${Math.random().toString(36).slice(2)}">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name || '')}" onerror="this.style.display='none'">
            <span class="nav-username">${escHtml(user.display_name || 'Fighter')}</span>
            <div class="nav-user-drop">
              <button class="nav-signout-btn" onclick="window.MMABridgeAuth.signOut()">Sign out</button>
            </div>
          </div>`;
      } else {
        el.innerHTML = `
          <a class="nav-signin-link" href="auth.html">Sign In</a>
          <a class="nav-signup-btn" href="auth.html">Sign Up</a>`;
      }
    });

    document.querySelectorAll('.nav-auth-mobile').forEach(el => {
      if (user) {
        el.innerHTML = `
          <div class="nav-mobile-user">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name || '')}" onerror="this.style.display='none'">
            <span>${escHtml(user.display_name || 'Fighter')}</span>
          </div>
          <button class="nav-mobile-signout" onclick="window.MMABridgeAuth.signOut()">Sign out</button>`;
      } else {
        el.innerHTML = `
          <a class="nav-signin-link" href="auth.html" style="display:block;margin-bottom:10px;">Sign In</a>
          <a class="nav-signup-btn" href="auth.html" style="display:block;text-align:center;">Sign Up</a>`;
      }
    });
  }

  // ── Profile helpers ───────────────────────────
  async function loadProfile(userId) {
    try {
      const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
      return data || null;
    } catch { return null; }
  }

  async function ensureProfile(session) {
    let profile = await loadProfile(session.user.id);
    if (!profile) {
      const meta   = session.user.user_metadata || {};
      const name   = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'Fighter';
      const avatar = meta.avatar_url || meta.picture || '';
      await sb.from('profiles').upsert({ id: session.user.id, display_name: name, avatar_url: avatar });
      profile = { id: session.user.id, display_name: name, avatar_url: avatar };
    }
    return profile;
  }

  // ── Auth state listener ───────────────────────
  sb.auth.onAuthStateChange(async (event, session) => {
    // Password reset link — let auth.html handle the UI
    if (event === 'PASSWORD_RECOVERY') {
      _session = session;
      window.dispatchEvent(new CustomEvent('auth:passwordRecovery'));
      return;
    }

    _session = session;

    // ── Redirect logic (runs BEFORE awaiting profile) ────
    // This prevents ensureProfile DB latency from delaying the redirect
    if (event === 'SIGNED_IN' && location.pathname.endsWith('auth.html')) {
      const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
      sessionStorage.removeItem('auth_return_to');
      // Signal auth.html to show welcome message
      window.dispatchEvent(new CustomEvent('auth:signedIn'));
      // Load profile in background, then redirect after brief welcome
      if (session?.user) {
        ensureProfile(session).then(p => { _profile = p; });
      }
      setTimeout(() => location.replace(returnTo), 1200);
      return;
    }

    // ── Normal session update (other pages) ─────
    if (session?.user) {
      _profile = await ensureProfile(session);
    } else {
      _profile = null;
    }
    renderNavAuth(_profile);
  });

  // ── Initial render ────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    // Show Sign In/Sign Up immediately — no async gap
    renderNavAuth(null);

    const { data: { session } } = await sb.auth.getSession();

    // Already signed in and visiting auth.html → redirect away immediately
    if (session && location.pathname.endsWith('auth.html')) {
      const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
      sessionStorage.removeItem('auth_return_to');
      location.replace(returnTo);
      return;
    }

    // onAuthStateChange handles updating the navbar when session exists
  });
})();
