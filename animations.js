// Scroll-reveal: adds .visible to .reveal elements when they enter the viewport
(function () {
  if (typeof IntersectionObserver === 'undefined') return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.08 });
  function observe() {
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
  // Re-observe after dynamic content loads
  window.mmabReveal = observe;
})();
