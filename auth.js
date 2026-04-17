// ==============================================
// MMA BRIDGE — AUTH MODULE
// Manages Google OAuth JWT, user state, navbar
// ==============================================

(function () {
  const TOKEN_KEY = 'mma_bridge_token';
  const USER_KEY  = 'mma_bridge_user';

  function apiBase() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // Exposed on window for other scripts (event-review.js etc.)
  window.MMABridgeAuth = {
    getToken,
    getUser,
    apiBase,
    authHeaders: () => {
      const t = getToken();
      return t ? { 'Authorization': `Bearer ${t}` } : {};
    }
  };

  // ── Render navbar auth slot ──────────────────
  function renderNavAuth(user) {
    document.querySelectorAll('.nav-auth').forEach(el => {
      if (user) {
        el.innerHTML = `
          <div class="nav-user" id="navUser_${Math.random().toString(36).slice(2)}">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name)}" onerror="this.style.display='none'">
            <span class="nav-username">${escHtml(user.display_name)}</span>
            <div class="nav-user-drop">
              <button class="nav-signout-btn" onclick="window.MMABridgeAuth.signOut()">Sign out</button>
            </div>
          </div>`;
      } else {
        el.innerHTML = `<a class="nav-signin-btn" href="auth.html">Sign In</a>`;
      }
    });

    // Mobile overlay sign-in slot
    document.querySelectorAll('.nav-auth-mobile').forEach(el => {
      if (user) {
        el.innerHTML = `
          <div class="nav-mobile-user">
            <img class="nav-avatar" src="${escHtml(user.avatar_url || '')}" alt="${escHtml(user.display_name)}" onerror="this.style.display='none'">
            <span>${escHtml(user.display_name)}</span>
          </div>
          <button class="nav-mobile-signout" onclick="window.MMABridgeAuth.signOut()">Sign out</button>`;
      } else {
        el.innerHTML = `<a class="nav-signin-btn" href="auth.html">Sign In with Google</a>`;
      }
    });
  }

  window.MMABridgeAuth.signOut = function () {
    clearAuth();
    location.reload();
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Init ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    const token  = params.get('token');
    const error  = params.get('error');

    // Handle post-OAuth redirect: ?token=<jwt>
    if (token) {
      try {
        const r = await fetch(`${apiBase()}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok) {
          const user = await r.json();
          setAuth(token, user);
          const returnTo = sessionStorage.getItem('auth_return_to') || 'index.html';
          sessionStorage.removeItem('auth_return_to');
          location.replace(returnTo);
          return;
        }
      } catch {}
      // Token bad — stay on auth page
      clearAuth();
    }

    if (error) {
      const msg = document.getElementById('auth-error-msg');
      if (msg) msg.textContent = 'Sign-in failed. Please try again.';
    }

    // Already logged in and on auth.html — redirect home
    const existingToken = getToken();
    if (existingToken && location.pathname.endsWith('auth.html')) {
      location.replace('index.html');
      return;
    }

    // Render navbar
    const user = getUser();
    renderNavAuth(user);

    // Silently refresh user data in background
    if (existingToken && user) {
      fetch(`${apiBase()}/auth/me`, {
        headers: { 'Authorization': `Bearer ${existingToken}` }
      }).then(r => {
        if (!r.ok) { clearAuth(); renderNavAuth(null); return; }
        return r.json();
      }).then(fresh => {
        if (fresh) {
          localStorage.setItem(USER_KEY, JSON.stringify(fresh));
          renderNavAuth(fresh);
        }
      }).catch(() => {});
    }
  });
})();
