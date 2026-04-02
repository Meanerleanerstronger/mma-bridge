// Apply saved theme immediately
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-mode');
}

// Wire up toggle when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const t = document.getElementById('themeToggle');
  if (!t) return;
  t.addEventListener('click', function() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });
});
