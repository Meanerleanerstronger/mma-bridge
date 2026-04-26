// ==============================================
// MMA BRIDGE — AUTH MODULE (Supabase)
// ==============================================

(function () {
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderNavAuth(user) {
    document.querySelectorAll('.nav-auth').forEach(el => {
      if (user) {
        el.innerHTML = `
          <div class="nav-user" id="navUser_${Math.random().toString(36).slice(2)}">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name || '')}" onerror="this.style.display='none'">
            <span class="nav-username">${escHtml(user.display_name || 'Fighter')}</span>
            <div class="nav-user-drop">
              <button type="button" class="nav-signout-btn" onclick="window.MMABridgeAuth.signOut()">Sign out</button>
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
          <button type="button" class="nav-mobile-signout" onclick="window.MMABridgeAuth.signOut()">Sign out</button>`;
      } else {
        el.innerHTML = `
          <a class="nav-signin-link" href="auth.html" style="display:block;margin-bottom:10px;">Sign In</a>
          <a class="nav-signup-btn" href="auth.html" style="display:block;text-align:center;">Sign Up</a>`;
      }
    });
  }

  // Scripts load at bottom of body — DOM is already parsed, render immediately
  renderNavAuth(null);

  const sb = window._sb;

  // Always expose MMABridgeAuth so other scripts never throw on missing methods
  function apiBase() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  // Stub (overwritten below if Supabase is available)
  window.MMABridgeAuth = {
    getToken:       () => null,
    getUser:        () => null,
    apiBase,
    authHeaders:    () => ({}),
    signOut:        () => location.reload(),
    signInWithEmail:  () => Promise.resolve({ error: { message: 'Auth service unavailable' } }),
    signUpWithEmail:  () => Promise.resolve({ error: { message: 'Auth service unavailable' } }),
    signInWithGoogle: () => {},
    resetPassword:    () => Promise.resolve({ error: { message: 'Auth service unavailable' } }),
    updatePassword:   () => Promise.resolve({ error: { message: 'Auth service unavailable' } }),
    getSupabase:      () => null,
  };

  if (!sb) return; // buttons already shown; Supabase CDN failed to load

  let _session = null;
  let _profile  = null;

  // Override stubs with real implementations
  window.MMABridgeAuth = {
    getToken:    () => _session?.access_token || null,
    getUser:     () => _profile || null,
    apiBase,
    authHeaders: () => {
      const t = _session?.access_token || null;
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
      sb.auth.signInWithOAuth({ provider: 'google' }),
    resetPassword: (email) =>
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/auth.html' }),
    updatePassword: (newPassword) => sb.auth.updateUser({ password: newPassword }),
    getSupabase: () => sb,
  };

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

  // ── Helper: redirect away from auth.html ──────
  function redirectFromAuth(label) {
    const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
    sessionStorage.removeItem('auth_return_to');
    if (label === 'signed_in') {
      // Give auth.html a moment to show welcome message
      window.dispatchEvent(new CustomEvent('auth:signedIn'));
      setTimeout(() => location.replace(returnTo), 1200);
    } else {
      location.replace(returnTo);
    }
  }

  function onAuthHtml() {
    return location.pathname.endsWith('auth.html');
  }

  // ── Auth state listener ───────────────────────
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _session = session;
      window.dispatchEvent(new CustomEvent('auth:passwordRecovery'));
      return;
    }

    _session = session;

    // Handle auth.html: both SIGNED_IN (email) and INITIAL_SESSION (Google OAuth callback)
    if (onAuthHtml() && session?.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      if (session?.user) {
        ensureProfile(session).then(p => { _profile = p; });
      }
      redirectFromAuth(event === 'SIGNED_IN' ? 'signed_in' : 'immediate');
      return;
    }

    // Normal pages — update navbar
    if (session?.user) {
      _profile = await ensureProfile(session);
    } else {
      _profile = null;
    }
    renderNavAuth(_profile);
  });
})();
