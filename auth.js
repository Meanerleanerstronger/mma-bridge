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
            <a href="profile.html" class="nav-user-link" title="View your profile">
              <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name || '')}" onerror="this.style.display='none'">
              <span class="nav-username">${escHtml(user.display_name || 'Fighter')}</span>
            </a>
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

  // Render Sign In/Sign Up immediately
  renderNavAuth(null);

  const sb = window._sb;

  function apiBase() {
    if (window.CONFIG && window.CONFIG.API && window.CONFIG.API.BASE_URL) return window.CONFIG.API.BASE_URL;
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  // Stubs so other scripts never throw if Supabase not loaded
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

  // ── Does this profile need the setup step? ────────────────────────
  // True when: no profile in DB, no display_name, or name is just the email prefix
  function profileNeedsSetup(profile, session) {
    if (!profile || !profile.display_name) return true;
    const emailPrefix = (session?.user?.email || '').split('@')[0].toLowerCase();
    if (emailPrefix && profile.display_name.toLowerCase() === emailPrefix) return true;
    return false;
  }

  // ── Persist / fetch profile from DB ──────────────────────────────
  async function syncProfile(session) {
    try {
      const { data } = await sb.from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      if (data) return data;
      // New user — create profile row (display_name may still need confirmation)
      const p = profileFromMeta(session);
      await sb.from('profiles').upsert({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      });
      return p;
    } catch {
      return null;
    }
  }

  // ── Redirect to setup or destination after sign-in ────────────────
  function redirectAfterSignIn(profile, session) {
    if (profileNeedsSetup(profile, session)) {
      const suggestedName = profileFromMeta(session).display_name;
      window.dispatchEvent(new CustomEvent('auth:needsSetup', {
        detail: { suggestedName }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('auth:signedIn'));
      setTimeout(() => {
        const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
        sessionStorage.removeItem('auth_return_to');
        location.replace(returnTo);
      }, 900);
    }
  }

  // ── Apply a session on non-auth pages ────────────────────────────
  function applySession(session) {
    _session = session;
    if (session?.user) {
      _profile = profileFromMeta(session);
      renderNavAuth(_profile);
      syncProfile(session).then(p => {
        if (!p) return;
        // If on a regular page and profile is incomplete, send to setup
        if (profileNeedsSetup(p, session) && !location.pathname.endsWith('auth.html')) {
          sessionStorage.setItem('auth_return_to', location.href);
          location.replace('auth.html?setup=1');
          return;
        }
        if (p.display_name && p.display_name !== _profile.display_name) {
          _profile = p;
          renderNavAuth(_profile);
        }
      });
    } else {
      _profile = null;
      renderNavAuth(null);
    }
  }

  // ── Auth state listener ───────────────────────────────────────────
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _session = session;
      window.dispatchEvent(new CustomEvent('auth:passwordRecovery'));
      return;
    }

    // On auth.html after sign-in: check profile completeness before redirecting
    if (location.pathname.endsWith('auth.html') && session?.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      _session = session;
      syncProfile(session).then(p => {
        if (p) _profile = p;
        redirectAfterSignIn(p, session);
      });
      return;
    }

    applySession(session);
  });

  // ── Check existing session on load (Google OAuth redirect safety net) ──
  sb.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user && !_profile) {
      applySession(session);
    }
    if (session?.user && location.pathname.endsWith('auth.html')) {
      // Check profile before redirecting — might need setup
      const p = await syncProfile(session);
      if (p) _profile = p;
      redirectAfterSignIn(p, session);
    }
  });
})();
