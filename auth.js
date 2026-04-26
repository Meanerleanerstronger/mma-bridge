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
          <div class="nav-user">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name || '')}" onerror="this.style.display='none'">
            <span class="nav-username">${escHtml(user.display_name || 'Fighter')}</span>
            <button type="button" class="nav-logout-btn" onclick="window.MMABridgeAuth.signOut()">Sign Out</button>
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

  // Render Sign In/Sign Up immediately — scripts at bottom of body, DOM already parsed
  renderNavAuth(null);

  const sb = window._sb;

  function apiBase() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  // Always expose MMABridgeAuth — stubs so other scripts never throw
  window.MMABridgeAuth = {
    getToken:         () => null,
    getUser:          () => null,
    apiBase,
    authHeaders:      () => ({}),
    signOut:          () => location.reload(),
    signInWithEmail:  () => Promise.resolve({ error: { message: 'Auth unavailable' } }),
    signUpWithEmail:  () => Promise.resolve({ error: { message: 'Auth unavailable' } }),
    signInWithGoogle: () => Promise.resolve({ error: { message: 'Auth unavailable' } }),
    resetPassword:    () => Promise.resolve({ error: { message: 'Auth unavailable' } }),
    updatePassword:   () => Promise.resolve({ error: { message: 'Auth unavailable' } }),
    getSupabase:      () => null,
  };

  if (!sb) return;

  let _session = null;
  let _profile  = null;

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

  // ── Build profile from session metadata (instant, no DB needed) ──
  function profileFromMeta(session) {
    const meta = session.user.user_metadata || {};
    return {
      id:           session.user.id,
      display_name: meta.full_name || meta.name || session.user.email?.split('@')[0] || 'Fighter',
      avatar_url:   meta.avatar_url || meta.picture || '',
    };
  }

  // ── Persist profile to DB (best-effort, non-blocking) ────────────
  async function syncProfile(session) {
    try {
      const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (data) return data;
      // New user — create profile
      const p = profileFromMeta(session);
      await sb.from('profiles').upsert({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
      return p;
    } catch {
      return null;
    }
  }

  // ── Apply a session: update navbar immediately, sync DB in background ──
  function applySession(session) {
    _session = session;
    if (session?.user) {
      // Show user immediately from metadata — zero latency
      _profile = profileFromMeta(session);
      renderNavAuth(_profile);
      // Then update with DB profile (may have a custom display name)
      syncProfile(session).then(p => {
        if (p && p.display_name !== _profile.display_name) {
          _profile = p;
          renderNavAuth(_profile);
        }
      });
    } else {
      _profile = null;
      renderNavAuth(null);
    }
  }

  // ── Auth state listener ───────────────────────
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _session = session;
      window.dispatchEvent(new CustomEvent('auth:passwordRecovery'));
      return;
    }

    // Handle auth.html: redirect away after successful sign-in
    if (location.pathname.endsWith('auth.html') && session?.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      _session = session;
      syncProfile(session).then(p => { if (p) _profile = p; });
      window.dispatchEvent(new CustomEvent('auth:signedIn'));
      setTimeout(() => {
        const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
        sessionStorage.removeItem('auth_return_to');
        location.replace(returnTo);
      }, 1200);
      return;
    }

    applySession(session);
  });

  // ── Check existing session on load (catches Google OAuth redirect) ──
  // onAuthStateChange also fires but getSession() is a reliable safety net
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session?.user && !_profile) {
      applySession(session);
    }
    // Already logged in + visiting auth.html → redirect immediately
    if (session?.user && location.pathname.endsWith('auth.html')) {
      const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
      sessionStorage.removeItem('auth_return_to');
      location.replace(returnTo);
    }
  });
})();
