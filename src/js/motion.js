/* NSG ROYAL RESORT — motion.js: parallax on [data-parallax] (off for reduced motion and
   small touch screens) and the ribbon pause toggle. Visual only. */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Parallax
  const layers = document.querySelectorAll('[data-parallax]');
  const smallTouch = window.matchMedia('(pointer: coarse) and (max-width: 767px)').matches;
  if (layers.length && !reduced && !smallTouch) {
    let ticking = false;
    const update = function () {
      ticking = false;
      const vh = window.innerHeight;
      layers.forEach(function (el) {
        const box = el.parentNode.getBoundingClientRect();
        if (box.bottom < 0 || box.top > vh) return;
        const speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        const offset = (vh / 2 - (box.top + box.height / 2)) * speed;
        el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  // 2. Home: mobile sticky bar appears once the hero has scrolled away
  const hero = document.querySelector('.hero-home');
  const bar = document.querySelector('.sticky-mobile-bar');
  if (hero && bar) {
    document.body.classList.add('has-sticky-js');
    let pending = false;
    const check = function () {
      pending = false;
      bar.classList.toggle('is-shown', hero.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener('scroll', function () {
      if (!pending) {
        pending = true;
        window.requestAnimationFrame(check);
      }
    }, { passive: true });
    check();
  }

  // 3. Ribbon pause toggle
  document.querySelectorAll('.ribbon-toggle').forEach(function (btn) {
    const ribbon = btn.closest('.ribbon');
    btn.addEventListener('click', function () {
      const paused = ribbon.classList.toggle('is-paused');
      btn.setAttribute('aria-pressed', String(paused));
      btn.textContent = paused ? '▶' : '❚❚';
    });
  });
})();
