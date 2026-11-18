/* NSG ROYAL RESORT — theme.js: light/dark switch ([data-theme-toggle], role="switch"). partials/theme-head.html has
   already applied the saved or system theme before CSS loaded; this file handles the toggle (saved in localStorage),
   the circular View Transition reveal from the toggle (colour cross-fade fallback, instant under reduced motion)
   and follows the system setting while nothing is saved. */
(function () {
  'use strict';
  const root = document.documentElement;
  const KEY = 'nsg_theme';
  const meta = document.querySelector('meta[name="theme-color"]');
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  const current = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };

  function set(theme) {
    root.setAttribute('data-theme', theme);
    if (meta) meta.setAttribute('content', theme === 'dark' ? meta.getAttribute('data-dark') || '#0B1512' : meta.getAttribute('data-light') || '#FBF8F2');
    toggles.forEach((b) => b.setAttribute('aria-checked', String(theme === 'dark')));
  }

  function change(theme, from) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return set(theme);
    if (document.startViewTransition && from) {
      const r = from.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add('theme-vt');
      const vt = document.startViewTransition(() => set(theme));
      vt.ready.then(() => root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(.22, .8, .26, 1)', pseudoElement: '::view-transition-new(root)' }
      )).catch(() => {});
      vt.finished.finally(() => root.classList.remove('theme-vt'));
      return;
    }
    root.classList.add('theme-fade');
    set(theme);
    setTimeout(() => root.classList.remove('theme-fade'), 300);
  }

  set(current());
  toggles.forEach((b) => b.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    change(next, b);
  }));

  const mq = matchMedia('(prefers-color-scheme: dark)');
  const follow = (e) => { const s = saved(); if (s !== 'light' && s !== 'dark') set(e.matches ? 'dark' : 'light'); };
  if (mq.addEventListener) mq.addEventListener('change', follow);
})();
