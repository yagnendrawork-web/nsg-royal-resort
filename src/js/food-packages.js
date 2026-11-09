/* NSG ROYAL RESORT — food-packages.js: group food packages on dining.html (#packages).
   Cards come live from api.addons() (category food). The page total is a guide only;
   real booking amounts always come from the server quote. Selection is kept in
   sessionStorage so leaving and coming back restores it. */
window.NSG = window.NSG || {};
(function () {
  'use strict';

  const STORE = 'nsg_food_packages';
  const QUICK = [8, 15, 25, 50];
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- Pure helpers (no DOM; also run by the Node verify script) ----

  const minOf = (item) => Math.max(1, item.minQty || 1);
  const maxOf = (item) => Math.max(minOf(item), item.maxQty || 100);

  /** Clamp a typed quantity; hint says which limit applied ('' when none) */
  function clampQty(item, raw) {
    const q = Math.round(Number(raw));
    if (!isFinite(q) || q < minOf(item)) return { qty: minOf(item), hint: 'min' };
    if (q > maxOf(item)) return { qty: maxOf(item), hint: 'max' };
    return { qty: q, hint: '' };
  }

  function unitLabel(item, t) {
    const u = (t && t.unitLabels) || {};
    if (u[item.id]) return u[item.id];
    if (item.unit === 'per_guest') return u.per_guest || 'per person';
    return u.default || 'per person';
  }

  function noun(item, qty, t) {
    const n = (t && t.unitNouns) || {};
    const pair = n[item.id] || n.default || ['plate', 'plates'];
    return qty === 1 ? pair[0] : pair[1];
  }

  /** Lines and total for a selection { id: qty } against the catalog (display only) */
  function summary(sel, catalog, t) {
    const lines = Object.keys(sel).map((id) => {
      const item = catalog.find((a) => a.id === id);
      if (!item || item.price === null) return null;
      const qty = clampQty(item, sel[id]).qty;
      return { id: id, name: item.name, qty: qty, unitPrice: item.price, lineTotal: qty * item.price,
        text: `${qty} ${noun(item, qty, t)} × ${inr(item.price)} = ${inr(qty * item.price)}` };
    }).filter(Boolean);
    return { lines: lines, total: lines.reduce((s, l) => s + l.lineTotal, 0) };
  }

  function bookingHref(sum) {
    return 'book.html?addons=' + sum.lines.map((l) => encodeURIComponent(l.id) + ':' + l.qty).join(',');
  }

  function whatsappText(sum, t) {
    return [t.waIntro]
      .concat(sum.lines.map((l) => `• ${l.name}: ${l.text}`))
      .concat([`${t.waTotal}: ${inr(sum.total)}`, t.waBooking])
      .join('\n');
  }

  // ---- Browser part ----
  const box = typeof document !== 'undefined' && document.getElementById('food-packages-app');
  window.NSG.FoodPackages = { clampQty: clampQty, summary: summary, bookingHref: bookingHref, whatsappText: whatsappText, unitLabel: unitLabel };
  if (!box) return;

  let t = {};
  try { t = JSON.parse((document.getElementById('fp-text') || {}).textContent || '{}'); } catch (e) {}
  const grid = box.querySelector('.fp-grid');
  const bar = box.querySelector('.fp-summary');
  const config = window.NSG.CONFIG || {};
  const wa = config.WHATSAPP && !String(config.WHATSAPP).startsWith('[TBD') ? 'https://wa.me/' + config.WHATSAPP : '';
  let catalog = [];
  let sel = {};
  const hints = {};

  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify(sel)); } catch (e) {}
  }

  function photo(item) {
    return window.NSG.img ? window.NSG.img(item.slot || item.id, item.name, 'fp-img') : '';
  }

  function cardHtml(item) {
    const on = sel[item.id] !== undefined;
    const priced = item.price !== null;
    const q = on ? sel[item.id] : minOf(item);
    const hint = hints[item.id] === 'min' ? t.minHint : hints[item.id] === 'max' ? t.maxHint : '';
    const line = on ? summary({ [item.id]: q }, catalog, t).lines[0] : null;
    return `<article class="fp-card${on ? ' is-on' : ''}" data-id="${esc(item.id)}">
      <div class="fp-media">${photo(item)}</div>
      <div class="fp-body">
        <h3 class="fp-name">${esc(item.name)}</h3>
        ${item.description ? `<p class="fp-desc">${esc(item.description)}</p>` : ''}
        <p class="fp-price">${priced ? `${inr(item.price)} <span>${esc(unitLabel(item, t))}</span>` : esc(t.failed)}</p>
        ${!priced ? '' : !on
          ? `<button type="button" class="btn btn-primary btn-md fp-add">${esc(t.add)}</button>`
          : `<div class="fp-qty-row">
              <div class="fp-stepper" role="group" aria-label="${esc(t.qtyLabel)}">
                <button type="button" class="fp-step" data-step="-1" aria-label="${esc(t.decrease)}"${q <= minOf(item) ? ' disabled' : ''}>−</button>
                <input type="number" class="fp-input" inputmode="numeric" min="${minOf(item)}" max="${maxOf(item)}" value="${q}" aria-label="${esc(t.qtyLabel)}: ${esc(item.name)}">
                <button type="button" class="fp-step" data-step="1" aria-label="${esc(t.increase)}"${q >= maxOf(item) ? ' disabled' : ''}>+</button>
              </div>
              <button type="button" class="fp-remove">${esc(t.remove)}</button>
            </div>
            <div class="fp-chips" role="group" aria-label="${esc(t.quickPick)}">${QUICK.filter((n) => n >= minOf(item) && n <= maxOf(item)).map((n) => `<button type="button" class="fp-chip" data-qty="${n}" aria-pressed="${n === q}">${n}</button>`).join('')}</div>
            <p class="fp-hint" aria-live="polite">${hint ? esc(hint.replace('{min}', minOf(item)).replace('{max}', maxOf(item)).replace('{noun}', noun(item, 2, t))) : ''}</p>
            <p class="fp-line">${esc(line.text)}</p>`}
      </div>
    </article>`;
  }

  function renderSummary() {
    const sum = summary(sel, catalog, t);
    const show = sum.lines.length > 0;
    bar.hidden = !show;
    document.body.classList.toggle('has-fp-summary', show);
    if (!show) return;
    const msg = encodeURIComponent(whatsappText(sum, t));
    const waHref = wa ? `${wa}?text=${msg}` : 'contact.html';
    const notice = String(t.notice || '').indexOf('[TBD') === -1 ? `<p class="fp-note">${esc(t.notice)}</p>` : '';
    bar.innerHTML = `<h3 class="fp-sum-title">${esc(t.summaryTitle)}</h3>
      <ul class="fp-sum-lines">${sum.lines.map((l) => `<li><span>${esc(l.name)}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>
      <p class="fp-sum-total"><span>${esc(t.total)}</span><strong>${inr(sum.total)}</strong></p>
      <p class="fp-sum-mobile"><strong>${inr(sum.total)}</strong> · ${sum.lines.length} ${esc(t.items)}</p>
      <p class="fp-note fp-note--gold">${esc(t.delivery)}</p>
      ${notice}
      <div class="fp-sum-actions">
        <a class="btn btn-primary btn-md" href="${bookingHref(sum)}">${esc(t.addToBooking)}</a>
        <a class="btn btn-secondary btn-md" href="${waHref}"${wa ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(t.orderWhatsApp)}</a>
      </div>
      <p class="fp-note fp-note--small">${esc(t.displayOnly)}</p>`;
  }

  function render() {
    grid.innerHTML = catalog.map(cardHtml).join('');
    renderSummary();
  }

  function setQty(id, raw, focusInput) {
    const item = catalog.find((a) => a.id === id);
    const c = clampQty(item, raw);
    sel[id] = c.qty;
    hints[id] = c.hint;
    save();
    render();
    if (focusInput) {
      const input = grid.querySelector(`.fp-card[data-id="${CSS.escape(id)}"] .fp-input`);
      if (input) input.focus();
    }
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.fp-card');
    if (!card) return;
    const id = card.getAttribute('data-id');
    const item = catalog.find((a) => a.id === id);
    if (e.target.closest('.fp-add')) {
      sel[id] = minOf(item);
      hints[id] = '';
      save();
      render();
      const input = grid.querySelector(`.fp-card[data-id="${CSS.escape(id)}"] .fp-input`);
      if (input) input.focus();
    } else if (e.target.closest('.fp-remove')) {
      delete sel[id];
      save();
      render();
      const add = grid.querySelector(`.fp-card[data-id="${CSS.escape(id)}"] .fp-add`);
      if (add) add.focus();
    } else if (e.target.closest('.fp-step')) {
      setQty(id, (sel[id] || minOf(item)) + Number(e.target.closest('.fp-step').getAttribute('data-step')));
    } else if (e.target.closest('.fp-chip')) {
      setQty(id, Number(e.target.closest('.fp-chip').getAttribute('data-qty')));
    }
  });
  // Typed quantities apply on blur or Enter, so typing "25" is not clamped at "2"
  grid.addEventListener('change', (e) => {
    if (e.target.classList.contains('fp-input')) setQty(e.target.closest('.fp-card').getAttribute('data-id'), e.target.value, true);
  });

  function fail() {
    grid.innerHTML = `<div class="fp-failed"><p>${esc(t.failed)}</p><a class="btn btn-primary btn-md" href="${wa || 'contact.html'}"${wa ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(t.orderWhatsApp)}</a></div>`;
    bar.hidden = true;
  }

  sel = load();
  if (!window.NSG.api || typeof window.NSG.api.addons !== 'function') return fail();
  window.NSG.api.addons().then((res) => {
    catalog = res && res.ok ? res.data.filter((a) => a.category === 'food') : [];
    if (!catalog.length) return fail();
    // keep only saved items that still exist and have a price
    Object.keys(sel).forEach((id) => {
      const item = catalog.find((a) => a.id === id && a.price !== null);
      if (item) sel[id] = clampQty(item, sel[id]).qty;
      else delete sel[id];
    });
    save();
    render();
  }, fail);
})();
