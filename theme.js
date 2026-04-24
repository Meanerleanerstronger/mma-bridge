// ── ZERO-FLASH THEME SCRIPT ─────────────────────────────────────────────────
// Runs synchronously in <head> before body renders.
// Applies theme to <html> immediately; mirrors to <body> on DOMContentLoaded.
// Default is dark mode. Persists choice in localStorage.

(function () {
  var theme = localStorage.getItem('theme') || 'dark';
  if (theme === 'light') {
    document.documentElement.classList.add('light-mode');
  }
})();

// ── Sun / Moon SVG strings ───────────────────────────────────────────────────
var _MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var _SUN_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

function _syncThemeBtn() {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  var lm = document.documentElement.classList.contains('light-mode') ||
           (document.body && document.body.classList.contains('light-mode'));
  btn.innerHTML = lm ? _SUN_SVG : _MOON_SVG;
  btn.setAttribute('aria-label', lm ? 'Switch to dark mode' : 'Switch to light mode');
  btn.title = lm ? 'Switch to dark mode' : 'Switch to light mode';
}

document.addEventListener('DOMContentLoaded', function () {
  var isLight = localStorage.getItem('theme') === 'light';

  // Mirror class to body (IIFE only set it on <html>)
  document.body.classList.toggle('light-mode', isLight);

  var btn = document.getElementById('themeToggle');
  if (!btn) return;

  _syncThemeBtn();

  btn.addEventListener('click', function () {
    var nowLight = document.body.classList.toggle('light-mode');
    document.documentElement.classList.toggle('light-mode', nowLight);
    localStorage.setItem('theme', nowLight ? 'light' : 'dark');
    _syncThemeBtn();
  });
});

// Belt-and-suspenders: also sync icon after all scripts settle
if (document.readyState !== 'loading') {
  requestAnimationFrame(_syncThemeBtn);
}
