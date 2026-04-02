// Apply saved theme IMMEDIATELY before page renders (prevents flash)
(function() {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light-mode');
    document.body && document.body.classList.add('light-mode');
  }
})();

// Wire toggle when DOM ready
document.addEventListener('DOMContentLoaded', function() {
  // Apply to body in case it wasn't ready above
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
  }

  const t = document.getElementById('themeToggle');
  if (!t) return;

  t.addEventListener('click', function() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });
});
