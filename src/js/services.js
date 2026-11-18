/* NSG ROYAL RESORT — services.js: enhances the build-time Services markup (partials/services*.html): filter, count-up,
   detail sheet, Addons-tab prices, quote selection (one WhatsApp message), event-first order. Text: site.json "services".
   NSG.services.render(container, { mode: 'full' | 'teaser' | 'booking', topic, limit }) */
window.NSG = window.NSG || {};
(function () {
  'use strict';
  let T = {};
  try { T = JSON.parse(document.getElementById('services-text').textContent); } catch (e) {}
  const NSG = window.NSG;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const PICK_KEY = 'nsg_svc_pick';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const get = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const all = () => (T.included || []).concat(T.extras || []);
  const byId = (id) => all().find((x) => x.id === id);
  const day = (d) => `${Number(d.slice(8, 10))} ${MONS[Number(d.slice(5, 7)) - 1]}`;
  const wa = (text) => {
    const n = String((NSG.CONFIG || {}).WHATSAPP || '');
    return n && !n.startsWith('[TBD') ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : 'contact.html';
  };
  const hasPhoto = (slot) => !!(NSG.IMG || {})[(NSG.IMG_USE || {})[slot] || slot];

  // Dates and guests are added only when book.js left a booking draft
  function message(names) {
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' ' + T.and + ' ' + names[names.length - 1] : names[0] || '';
    const d = get('nsg_booking_draft');
    const when = d && d.checkIn && d.checkOut ? fill(T.whatsappWhen, { dates: day(d.checkIn) + ' – ' + day(d.checkOut), guests: d.guests || '' }) : '';
    return fill(T.whatsapp, { items: list, when: when });
  }

  // Events page: event items first
  function order(root, topic) {
    if (topic !== 'event') return;
    const rank = (li) => { const r = { event: 0, both: 1, stay: 2 }[li.dataset.topic]; return r === undefined ? 1 : r; };
    root.querySelectorAll('.svc-grid').forEach((g) => [...g.children].sort((a, b) => rank(a) - rank(b)).forEach((li) => g.appendChild(li)));
  }

  // Filter pill: leaving cards fade, the rest glide into place (FLIP)
  function filter(root) {
    const box = root.querySelector('.svc-filter');
    if (!box) return;
    box.hidden = false;
    const btns = [...box.querySelectorAll('.svc-filter-btn')];
    const ind = box.querySelector('.svc-filter-ind');
    const place = () => { const b = box.querySelector('[aria-pressed="true"]'); ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; };
    btns.forEach((b) => b.addEventListener('click', async () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      place();
      const f = b.dataset.filter;
      const groups = [...root.querySelectorAll('.svc-group')];
      const leaving = groups.filter((g) => !g.hidden && f !== 'all' && g.dataset.group !== f);
      if (!reduced) await Promise.all(leaving.flatMap((g) => [...g.querySelectorAll('.svc-card')].map((c) => c.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 150, fill: 'forwards' }).finished)));
      const cards = [...root.querySelectorAll('.svc-card')];
      const first = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
      groups.forEach((g) => {
        g.hidden = f !== 'all' && g.dataset.group !== f;
        g.querySelectorAll('.svc-card').forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
      });
      if (reduced) return;
      cards.forEach((c) => {
        if (c.closest('.svc-group').hidden) return;
        const a = first.get(c);
        const z = c.getBoundingClientRect();
        c.animate(a.width ? [{ transform: `translate(${a.left - z.left}px, ${a.top - z.top}px)` }, { transform: 'none' }] : [{ opacity: 0, transform: 'translateY(12px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22, .8, .26, 1)' });
      });
    }));
    place();
    addEventListener('resize', place);
    if (document.fonts) document.fonts.ready.then(place);
  }


  function countUp(root) {
    const el = root.querySelector('.svc-count-n');
    if (!el || reduced || !('IntersectionObserver' in window)) return;
    const n = Number(el.textContent) || 0;
    el.textContent = '0';
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    io.observe(el);
  }

  // The card name becomes a button stretched over the card (opens the sheet)
  function cards(root) {
    root.querySelectorAll('.svc-card').forEach((c) => {
      const h = c.querySelector('.svc-name');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'svc-open';
      b.textContent = h.textContent;
      b.setAttribute('aria-haspopup', 'dialog');
      h.textContent = '';
      h.appendChild(b);
      b.addEventListener('click', () => sheet(c, b));
      c.classList.add('is-live');
    });
  }

  // An add-on priced in the Addons tab (same id) gets its price and "Add to booking"
  function prices(root) {
    if (!NSG.api || !NSG.api.addons) return;
    NSG.api.addons().then((r) => {
      if (!r || !r.ok) return;
      const L = (NSG.UI && NSG.UI.labels) || {};
      const unit = { per_guest: L.unitPerPerson, per_night: L.unitPerNight, per_qty: L.unitEach, flat: L.unitPerBooking };
      r.data.forEach((a) => {
        const c = root.querySelector(`.svc-card--ext[data-svc="${CSS.escape(a.id)}"]`);
        if (!c || typeof a.price !== 'number') return;
        c.querySelector('.svc-price').textContent = `₹${a.price.toLocaleString('en-IN')} ${unit[a.unit] || ''}`.trim();
        c.classList.add('is-priced');
        const add = document.createElement('a');
        add.className = 'btn btn-primary btn-sm svc-add';
        add.href = `book.html?addons=${encodeURIComponent(a.id)}:${a.minQty || 1}`;
        add.textContent = T.extrasGroup.addToBooking;
        add.dataset.cta = 'services:add-' + a.id;
        const enq = c.querySelector('.svc-enquire');
        enq.replaceWith(add);
      });
    });
  }

  // Selected add-ons (kept for the visit) go out in one WhatsApp message
  function picks(root) {
    const bar = root.querySelector('.svc-bar');
    const X = T.extrasGroup || {};
    let sel = (get(PICK_KEY) || []).filter((id) => byId(id));
    const sync = () => {
      root.querySelectorAll('.svc-card--ext').forEach((c) => {
        const on = sel.includes(c.dataset.svc);
        c.classList.toggle('is-picked', on);
        c.querySelector('.svc-pick').setAttribute('aria-pressed', String(on));
      });
      put(PICK_KEY, sel);
      bar.hidden = !sel.length;
      document.body.classList.toggle('has-svc-bar', sel.length > 0);
      if (!sel.length) return;
      bar.querySelector('.svc-bar-n').textContent = fill(X.selected, { n: sel.length });
      bar.querySelector('.svc-bar-wa').href = wa(message(sel.map((id) => byId(id).name)));
    };
    root.querySelectorAll('.svc-card--ext').forEach((c) => {
      const it = byId(c.dataset.svc);
      const b = c.querySelector('.svc-pick');
      const enq = c.querySelector('.svc-enquire');
      if (!it) return;
      if (enq) enq.href = wa(message([it.name]));
      b.hidden = false;
      b.setAttribute('aria-label', fill(X.select, { name: it.name }));
      b.addEventListener('click', () => { sel = sel.includes(it.id) ? sel.filter((x) => x !== it.id) : sel.concat(it.id); sync(); });
    });
    bar.querySelector('.svc-bar-clear').addEventListener('click', () => { sel = []; sync(); });
    root._svcSync = sync;
    sync();
  }

  // Detail sheet (bottom sheet / popover): Esc, close, focus trap, focus returns
  function sheet(card, from) {
    const it = byId(card.dataset.svc);
    if (!it) return;
    const S = T.sheet || {};
    const when = it.duration || it.durationNote;
    const price = card.querySelector('.svc-price');
    const acts = card.querySelector('.svc-actions');
    const wrap = document.createElement('div');
    wrap.className = 'svc-sheet';
    wrap.innerHTML = `<div class="svc-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="svc-sheet-title">
      <button type="button" class="svc-sheet-x" aria-label="${esc(S.close)}"><svg aria-hidden="true"><use href="#svc-i-plus"/></svg></button>
      ${it.photoSlot && NSG.img && hasPhoto(it.photoSlot) ? `<div class="svc-sheet-photo">${NSG.img(it.photoSlot, it.name)}</div>` : ''}
      <span class="svc-ic">${card.querySelector('.svc-ic').innerHTML}</span>
      <h3 id="svc-sheet-title">${esc(it.name)}</h3><p>${esc(it.detail)}</p>
      <dl class="svc-sheet-facts">${when ? `<div><dt>${esc(S.duration)}</dt><dd>${esc(when)}</dd></div>` : ''}<div><dt>${esc(S.appliesTo)}</dt><dd>${esc((S.topics || {})[it.topic] || '')}</dd></div>${price ? `<div><dt></dt><dd>${esc(price.textContent)}</dd></div>` : ''}</dl>
      ${acts ? `<div class="svc-actions">${acts.innerHTML}</div>` : card.querySelector('.svc-tag').outerHTML}
    </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('has-svc-sheet');
    const panel = wrap.firstElementChild;
    const pick = panel.querySelector('.svc-pick');
    if (pick) pick.addEventListener('click', () => { card.querySelector('.svc-pick').click(); pick.setAttribute('aria-pressed', card.querySelector('.svc-pick').getAttribute('aria-pressed')); });
    const close = () => {
      wrap.remove();
      document.body.classList.remove('has-svc-sheet');
      document.removeEventListener('keydown', key);
      from.focus();
    };
    const key = (e) => {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;
      const f = [...panel.querySelectorAll('a[href], button:not([hidden])')];
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    panel.querySelector('.svc-sheet-x').addEventListener('click', close);
    document.addEventListener('keydown', key);
    panel.querySelector('.svc-sheet-x').focus();
  }

  // Teaser / booking chips from the data when a container is empty
  function chips(limit) {
    return `<ul class="svc-chips">${(T.included || []).slice(0, limit || 6).map((x) => `<li class="svc-chip-item"><svg aria-hidden="true"><use href="#svc-i-${esc(x.icon)}"/></svg><span>${esc(x.name)}</span><small>${esc(x.duration || x.durationNote || '')}</small></li>`).join('')}</ul>`;
  }

  function render(root, opts) {
    if (!root || root.dataset.svcReady) return;
    opts = opts || {};
    const mode = opts.mode || root.dataset.services || 'full';
    root.dataset.svcReady = '1';
    if (mode !== 'full') {
      if (!root.querySelector('.svc-chip-item')) root.insertAdjacentHTML('beforeend', chips(opts.limit));
      return;
    }
    order(root, opts.topic || root.dataset.topic);
    cards(root);
    filter(root);
    countUp(root);
    prices(root);
    picks(root);
  }

  NSG.services = { render: render, message: message };
  document.querySelectorAll('[data-services]').forEach((el) => render(el, { mode: el.dataset.services, topic: el.dataset.topic }));
})();
