/* NSG ROYAL RESORT — amenities.js: hides [TBD] detail lines and lights up the
   jump-bar link for the section in view. Loaded on amenities.html only. */
(function () {
  'use strict';

  // 1. Hide lines whose content is still a [TBD: ...] placeholder
  document.querySelectorAll('[data-optional]').forEach(function (el) {
    if (el.textContent.indexOf('[TBD') !== -1) el.hidden = true;
  });

  // 2. Jump bar scroll-spy
  const links = Array.prototype.slice.call(document.querySelectorAll('.am-jump-link'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  const bar = document.querySelector('.am-jump-list');
  const byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

  function light(id) {
    links.forEach(function (a) {
      const on = a === byId[id];
      a.classList.toggle('is-active', on);
      if (on) {
        a.setAttribute('aria-current', 'true');
        // Keep the lit link visible when the bar scrolls sideways on phones
        bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  // A section counts as "in view" when it crosses a line ~35% down the screen
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) light(e.target.id);
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  Object.keys(byId).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
})();
