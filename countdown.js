/* MMA Bridge — shared countdown utility v1.1
   Adds: digit-flip animation, urgency/soon classes on parent pill
*/
(function () {
  'use strict';

  var _ivs = {};

  function pad(n) { return String(n).padStart(2, '0'); }

  /* Extract current number texts from rendered cd-n spans */
  function prevNums(el) {
    return Array.from(el.querySelectorAll('.cd-n')).map(function (s) { return s.textContent; });
  }

  /* After setting innerHTML, flip any cd-n spans whose value changed */
  function applyFlip(el, prev) {
    var next = el.querySelectorAll('.cd-n');
    next.forEach(function (span, i) {
      if (prev[i] !== undefined && prev[i] !== span.textContent) {
        span.classList.remove('cd-flip');
        void span.offsetWidth; // restart animation
        span.classList.add('cd-flip');
      }
    });
  }

  /**
   * Start a live countdown inside el.
   * @param {HTMLElement} el
   * @param {string} targetUtc  — ISO UTC e.g. "2026-05-10T02:00:00Z"
   * @returns {function} stop()
   */
  function initCountdown(el, targetUtc) {
    if (!el || !targetUtc) return function () {};

    var target = new Date(targetUtc).getTime();
    var LIVE_WINDOW = 6 * 3600 * 1000;
    var key = el.id || (el.id = 'cd-' + Math.random().toString(36).slice(2));

    if (_ivs[key]) { clearInterval(_ivs[key]); delete _ivs[key]; }

    function render() {
      if (!el.isConnected) { clearInterval(_ivs[key]); delete _ivs[key]; return; }
      var diff = target - Date.now();

      if (diff <= 0) {
        if (-diff < LIVE_WINDOW) {
          el.innerHTML = '<span class="cd-live"><span class="cd-live-dot"></span>LIVE</span>';
        } else {
          el.innerHTML = '<span class="cd-ended">—</span>';
          clearInterval(_ivs[key]); delete _ivs[key];
        }
        // Remove urgency classes when live/ended
        el.classList.remove('cd-is-urgent', 'cd-is-soon');
        return;
      }

      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      var html;

      if (diff > 7 * 86400000) {
        html = '<span class="cd-n">' + d + '</span><span class="cd-u">d</span>';
      } else if (diff > 3 * 86400000) {
        html = '<span class="cd-n">' + d + '</span><span class="cd-u">d</span> <span class="cd-n">' + h + '</span><span class="cd-u">h</span>';
      } else if (diff > 86400000) {
        html = '<span class="cd-n">' + d + '</span><span class="cd-u">d</span> <span class="cd-n">' + h + '</span><span class="cd-u">h</span> <span class="cd-n">' + pad(m) + '</span><span class="cd-u">m</span>';
      } else if (diff > 3600000) {
        html = '<span class="cd-n">' + h + '</span><span class="cd-u">h</span> <span class="cd-n">' + pad(m) + '</span><span class="cd-u">m</span> <span class="cd-n">' + pad(s) + '</span><span class="cd-u">s</span>';
      } else {
        html = '<span class="cd-n cd-urgent">' + m + '</span><span class="cd-u cd-urgent">m</span> <span class="cd-n cd-urgent">' + pad(s) + '</span><span class="cd-u cd-urgent">s</span>';
      }

      // Capture previous values before replacing innerHTML
      var prev = prevNums(el);
      el.innerHTML = html;

      // Flip digits that changed
      applyFlip(el, prev);

      // Urgency classes on the pill element itself
      var isUrgent = diff < 3600000;
      var isSoon   = !isUrgent && diff < 86400000;
      el.classList.toggle('cd-is-urgent', isUrgent);
      el.classList.toggle('cd-is-soon',   isSoon);
    }

    render();
    var iv = setInterval(render, 1000);
    _ivs[key] = iv;

    return function stop() { clearInterval(iv); delete _ivs[key]; };
  }

  /**
   * Format a UTC timestamp to the user's local timezone string.
   */
  function formatLocalTime(utcString) {
    if (!utcString) return '';
    try {
      var d = new Date(utcString);
      return d.toLocaleString([], {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      });
    } catch (e) { return ''; }
  }

  window.initCountdown   = initCountdown;
  window.formatLocalTime = formatLocalTime;
})();
