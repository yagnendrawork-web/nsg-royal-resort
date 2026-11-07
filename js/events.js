/* NSG ROYAL RESORT — events.js: event-type tabs, "Plan this event" pre-fill and
   the photo spotlight on past celebrations. Loaded on events.html only. */
(function () {
  'use strict';

  // 1. Hide lines whose content is still a [TBD: ...] placeholder
  document.querySelectorAll('[data-optional]').forEach(function (el) {
    if (el.textContent.indexOf('[TBD') !== -1) el.hidden = true;
  });
  // ...and a list (with its label) once every line in it is hidden
  document.querySelectorAll('.ev-list').forEach(function (list) {
    if (list.querySelector('li:not([hidden])')) return;
    list.hidden = true;
    if (list.previousElementSibling) list.previousElementSibling.hidden = true;
  });

  // 2. Tabs (WAI-ARIA tabs pattern: arrows, Home/End, roving tabindex)
  const tablist = document.querySelector('.ev-tabs');
  const tabs = tablist ? Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]')) : [];
  const indicator = tablist && tablist.querySelector('.ev-tab-indicator');

  function moveIndicator(tab) {
    if (!indicator) return;
    indicator.style.width = tab.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }

  function select(tab, focus) {
    tabs.forEach(function (t) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    moveIndicator(tab);
    // Keep the chosen tab centred when the strip scrolls sideways on phones
    tablist.scrollLeft = tab.offsetLeft - (tablist.clientWidth - tab.offsetWidth) / 2;
    if (focus) tab.focus({ preventScroll: true });
  }

  if (tabs.length) {
    document.querySelector('.ev-host').classList.add('is-tabbed');
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    // Open the tab named in the URL hash (events.html#birthday), else the first
    const fromHash = document.getElementById('ev-tab-' + location.hash.slice(1));
    select(fromHash || tabs[0]);
    window.addEventListener('resize', function () {
      const cur = tablist.querySelector('[aria-selected="true"]');
      if (cur) moveIndicator(cur);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { moveIndicator(tablist.querySelector('[aria-selected="true"]')); });
    }
    tablist.classList.add('is-ready');
  }

  // 3. "Plan this event" pre-selects the event type in the enquiry form
  const typeSelect = document.getElementById('ev-event-type');
  document.querySelectorAll('[data-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!typeSelect) return;
      typeSelect.value = btn.getAttribute('data-plan');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      typeSelect.classList.remove('is-prefilled');
      void typeSelect.offsetWidth;
      typeSelect.classList.add('is-prefilled');
      setTimeout(function () {
        const name = document.getElementById('ev-name');
        if (name) name.focus({ preventScroll: true });
      }, 450);
    });
  });

  // 4. Soft spotlight that follows the pointer over past-celebration photos
  if (window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
    document.querySelectorAll('.ev-moment').forEach(function (fig) {
      fig.addEventListener('pointermove', function (e) {
        const r = fig.getBoundingClientRect();
        fig.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        fig.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }
})();
