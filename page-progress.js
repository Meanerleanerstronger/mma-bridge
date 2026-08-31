// Top-of-page loading bar for full-page navigations. This site is a stack
// of plain multi-page HTML with no SPA router — every link click is a real
// browser navigation. Chrome/Edge get an automatic crossfade from the
// @view-transition CSS rule, but Safari and Firefox get nothing: a click
// just sits there with zero feedback until the next page's HTML arrives,
// which reads as broken/slow rather than a polished app. This runs in
// every browser and gives instant feedback the moment a link is clicked,
// independent of whatever the destination page ends up doing.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var bar = document.createElement('div');
  bar.id = 'pgProgressBar';
  document.documentElement.appendChild(bar);

  var style = document.createElement('style');
  style.textContent =
    '#pgProgressBar{position:fixed;top:0;left:0;height:3px;width:0%;z-index:99999;' +
    'background:linear-gradient(90deg,#c24a08,#f2600f 60%,#ffb066);' +
    'box-shadow:0 0 8px rgba(242, 96, 15,0.6);opacity:0;pointer-events:none;' +
    (reduceMotion ? '' : 'transition:width 0.2s ease,opacity 0.2s ease;') + '}' +
    '#pgProgressBar.pg-on{opacity:1;}' +
    '#pgProgressBar.pg-done{transition:width 0.2s ease,opacity 0.3s ease 0.15s;opacity:0;}';
  document.head.appendChild(style);

  var trickleTimer = null;
  var width = 0;

  function setWidth(w) {
    width = w;
    bar.style.width = w + '%';
  }

  function start() {
    if (trickleTimer) return; // already running
    bar.classList.remove('pg-done');
    bar.classList.add('pg-on');
    setWidth(20);
    trickleTimer = setInterval(function () {
      // Slows down the closer it gets to 90 — never claims to finish
      // until something (load/finish()) actually says it did.
      var inc = width < 50 ? 8 : width < 80 ? 3 : 0.5;
      if (width < 90) setWidth(Math.min(width + inc, 90));
    }, 280);
  }

  function finish() {
    if (trickleTimer) { clearInterval(trickleTimer); trickleTimer = null; }
    setWidth(100);
    bar.classList.add('pg-done');
    setTimeout(function () { setWidth(0); bar.classList.remove('pg-on'); }, 450);
  }

  // Start immediately if this page itself is still loading (covers a
  // slow initial load / cold-start fetch delaying first paint).
  if (document.readyState !== 'complete') start();
  window.addEventListener('load', finish);

  // Kick off on same-origin, same-tab link clicks — the moment a user
  // taps a nav item, card, or button, before the browser even starts
  // unloading the current page.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '' && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0 || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    try {
      var url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
      // Same-page anchor/query-only jump on the exact same path — no
      // real navigation is about to happen, don't show a bar for it.
      if (url.pathname === location.pathname && url.hash) return;
    } catch (_) { return; }
    start();
  }, true);

  // Browser back/forward navigations (bfcache or fresh load either way).
  window.addEventListener('pageshow', function () {
    if (trickleTimer) { clearInterval(trickleTimer); trickleTimer = null; }
    bar.classList.remove('pg-on', 'pg-done');
    setWidth(0);
  });
})();
