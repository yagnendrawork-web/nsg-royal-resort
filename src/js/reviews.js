/* NSG ROYAL RESORT — reviews.js: [data-reviews="strip|card|ribbon"] from api.reviews(), text as sent; nothing
   renders without approved reviews. Options: data-topic, data-topic-from, data-featured, data-variant="dark". */
(function () {
  'use strict';
  const api = window.NSG && window.NSG.api;
  if (!api || !api.reviews) return;
  let t = {};
  try { t = JSON.parse(document.getElementById('reviews-text').textContent); } catch (e) {}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const SRC = {
    google: '<circle cx="12" cy="12" r="9.5"/><path d="M16.5 11.5H12m4.5 0a4.5 4.5 0 1 1-1.3-3.2"/>',
    whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/>'
  };

  let dataP = null;
  const load = () => dataP || (dataP = api.reviews().then((r) => (r.ok && r.data.reviews.length ? r.data : null)));
  const stars = (r) => `<span class="rv-stars" role="img" aria-label="${esc(fill(t.starsLabel, { rating: r }))}"><span style="width:${Math.max(0, Math.min(5, r)) * 20}%"></span></span>`;
  const hasRating = (d) => d.rating !== null && d.count !== null;
  const nRev = (d) => d.count.toLocaleString('en-IN');
  const link = (d, cls, label) => (d.url ? `<a${cls} href="${esc(d.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : '');

  function strip(d, dark) {
    if (!hasRating(d)) return '';
    return `<span class="rv-strip${dark ? ' rv-strip--dark' : ''}">${stars(d.rating)}<strong>${esc(fill(t.onGoogle, { rating: d.rating }))}</strong><span class="rv-strip-count">${esc(fill(t.count, { n: nRev(d) }))}</span>${link(d, '', t.readAll)}</span>`;
  }

  function card(r, cls, more) {
    const icon = SRC[r.source] ? `<svg class="rv-src" viewBox="0 0 24 24" role="img" aria-label="${esc((t.sources || {})[r.source])}">${SRC[r.source]}</svg>` : '';
    const when = r.date ? ` · ${MONS[Number(r.date.slice(5, 7)) - 1]} ${r.date.slice(0, 4)}` : '';
    return `<figure class="rv-card${cls}"><div class="rv-card-top">${r.rating ? stars(r.rating) : ''}${icon}</div>
      <blockquote class="rv-text">${esc(r.text)}</blockquote>${more ? `<button type="button" class="rv-more" aria-expanded="false" hidden>${esc(t.more)}</button>` : ''}
      <figcaption class="rv-by"><strong>${esc(r.name)}</strong>${when}</figcaption></figure>`;
  }

  // Topic, else general/featured; data-featured: one short review
  function pick(list, topic, featured) {
    let pool = topic ? list.filter((r) => r.topic === topic) : list;
    if (!pool.length) pool = list.filter((r) => r.topic === 'general' || r.featured);
    if (!featured) return pool.slice(0, 6);
    const order = pool.filter((r) => r.featured).concat(list.filter((r) => r.featured), pool);
    const one = order.find((r) => r.text.length <= 160) || order[0];
    return one ? [one] : [];
  }

  const cards = (list) => (list.length ? `<div class="rv-cards">${list.map((r, i) => card(r, i ? ' is-off' : '', true)).join('')}</div>` : '');

  // Under 4 reviews: a static row, no marquee
  function ribbon(d) {
    const list = d.reviews.slice(0, 12);
    const few = list.length < 4;
    const set = (dup) => `<div class="rv-rb-set${dup ? ' rv-rb-dup' : ''}">${list.map((r) => card(r, '', false)).join('')}</div>`;
    const summary = hasRating(d) ? fill(t.summary, { rating: d.rating, n: nRev(d) }) : t.summaryNoRating;
    return `<div class="rv-ribbon${few ? ' is-static' : ''}" style="--rv-dur:${Math.max(30, list.length * 8)}s"><p class="visually-hidden">${esc(summary)}</p>
      <div class="rv-rb-view" aria-hidden="true"><div class="rv-rb-track">${set(false)}${few ? '' : set(true)}</div></div>
      ${d.url ? `<p class="rv-rb-all">${link(d, ' class="btn btn-secondary btn-md"', t.seeAll)}</p>` : ''}</div>`;
  }

  // "more" only when the clamped text overflows
  function wireMore(root) {
    root.querySelectorAll('.rv-card').forEach((c) => {
      const text = c.querySelector('.rv-text');
      const btn = c.querySelector('.rv-more');
      if (!btn || text.scrollHeight <= text.clientHeight + 1) return;
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const open = c.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? t.less : t.more;
      });
    });
  }

  // 7 s crossfade; pauses on hover, focus, touch or an open card; stops off screen
  function rotate(box) {
    const slides = box.querySelectorAll('.rv-card');
    if (slides.length < 2 || reduced || !('IntersectionObserver' in window)) return;
    let i = 0, timer = 0, touchUntil = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const tick = () => {
      if (!box.isConnected) { stop(); io.disconnect(); return; }
      if (box.matches(':hover, :focus-within') || Date.now() < touchUntil || box.querySelector('.is-open')) return;
      slides[i].classList.add('is-off');
      i = (i + 1) % slides.length;
      slides[i].classList.remove('is-off');
    };
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { if (!timer) timer = setInterval(tick, 7000); } else stop(); });
    io.observe(box);
    box.addEventListener('touchstart', () => { touchUntil = Date.now() + 8000; }, { passive: true });
  }

  // Ribbon: CSS marquee (hover pause in CSS); touch pauses it, a drag seeks it
  function wireRibbon(rb) {
    const view = rb.querySelector('.rv-rb-view');
    const track = rb.querySelector('.rv-rb-track');
    if (reduced || rb.classList.contains('is-static') || !track.getAnimations) return;
    let a = null, x0 = 0, t0 = 0, resume = 0;
    view.addEventListener('pointerdown', (e) => {
      a = track.getAnimations()[0] || null;
      if (!a) return;
      clearTimeout(resume);
      rb.classList.add('is-paused');
      x0 = e.clientX;
      t0 = a.currentTime || 0;
    });
    view.addEventListener('pointermove', (e) => {
      if (!a) return;
      const dur = a.effect.getComputedTiming().duration;
      const ct = t0 - ((e.clientX - x0) / (track.scrollWidth / 2)) * dur;
      a.currentTime = ((ct % dur) + dur) % dur;
    });
    const up = () => {
      if (!a) return;
      a = null;
      resume = setTimeout(() => rb.classList.remove('is-paused'), 2500);
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => view.addEventListener(n, up));
  }

  function topicOf(el) {
    const from = el.getAttribute('data-topic-from');
    const r = from && document.querySelector(`input[name="${from}"]:checked`);
    return r ? (r.value === 'event' ? 'event' : 'stay') : el.getAttribute('data-topic') || '';
  }

  function render(el, d) {
    let html = '';
    el.getAttribute('data-reviews').split(/\s+/).forEach((m) => {
      if (m === 'strip') html += strip(d, el.getAttribute('data-variant') === 'dark');
      else if (m === 'card') html += cards(pick(d.reviews, topicOf(el), el.hasAttribute('data-featured')));
      else if (m === 'ribbon') html += ribbon(d);
    });
    el.innerHTML = html;
    el.classList.toggle('rv-on', !!html);
    if (!html) return;
    const sec = el.closest('[data-reviews-section]');
    if (sec) sec.hidden = false;
    wireMore(el);
    el.querySelectorAll('.rv-cards').forEach(rotate);
    el.querySelectorAll('.rv-ribbon').forEach(wireRibbon);
  }

  function mount(el) {
    el.setAttribute('data-rv', '');
    load().then((d) => {
      if (!d) return;
      render(el, d);
      const from = el.getAttribute('data-topic-from');
      if (from) document.querySelectorAll(`input[name="${from}"]`).forEach((r) => r.addEventListener('change', () => { if (el.isConnected) render(el, d); }));
    });
  }

  const scan = (root) => root.querySelectorAll('[data-reviews]:not([data-rv])').forEach(mount);
  scan(document);
  document.querySelectorAll('[data-reviews-watch]').forEach((w) => new MutationObserver(() => scan(w)).observe(w, { childList: true, subtree: true }));
})();
