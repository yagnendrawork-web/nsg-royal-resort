/* NSG ROYAL RESORT — addons.js: the optional "Make it special" add-ons on book.html.
   Owns the selection (kept in sessionStorage with the rest of the booking), renders the
   items from api.addons(), and turns the SERVER quote into summary rows. The client never
   computes payable amounts: every amount shown comes from api.getQuote(). */
window.NSG = window.NSG || {};
(function () {
  'use strict';

  const STORE = 'nsg_addons';
  const ui = () => (window.NSG.UI && window.NSG.UI.addons) || {};
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- Pure helpers (no DOM; also run by the Node verify script) ----

  /** Selection is { id: qty }. Adding an item twice keeps one; per_qty items add up to maxQty. */
  function add(sel, item, qty) {
    const next = Object.assign({}, sel);
    const n = Math.max(1, Number(qty) || 1);
    if (item.unit === 'per_qty') next[item.id] = Math.min(item.maxQty || 10, (next[item.id] || 0) + n);
    else next[item.id] = 1;
    return next;
  }

  function remove(sel, id) {
    const next = Object.assign({}, sel);
    delete next[id];
    return next;
  }

  function setQty(sel, item, qty) {
    const q = Math.round(Number(qty) || 0);
    if (q < 1) return remove(sel, item.id);
    return Object.assign({}, sel, { [item.id]: Math.min(item.maxQty || 10, q) });
  }

  /** "id" or "id:qty" list (from ?addons=) -> selection; repeated ids are merged */
  function parseParam(text, catalog) {
    let sel = {};
    String(text || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
      const bits = part.split(':');
      const item = (catalog || []).find((a) => a.id === bits[0]);
      if (item && item.price !== null) sel = add(sel, item, bits[1] || 1);
    });
    return sel;
  }

  const toList = (sel) => Object.keys(sel).map((id) => ({ id: id, qty: sel[id] }));

  /**
   * Summary rows from a server quote. Returns [] when the quote has no add-ons, so the
   * existing summary stays exactly as before. Events have no server quote: names only.
   */
  function summaryRows(quote, opts) {
    opts = opts || {};
    const t = opts.labels || ui();
    if (opts.isEvent) {
      const picked = opts.picked || [];
      if (!picked.length) return [];
      return picked.map((a) => ({ label: a.name + (a.qty > 1 ? ' × ' + a.qty : ''), amount: null, note: t.eventNote }));
    }
    const lines = (quote && quote.addonsBreakdown) || [];
    if (!lines.length) return [];
    const rows = [{ label: t.rowBase, amount: quote.baseTotal }];
    lines.forEach((l) => rows.push({
      label: l.name + ' × ' + l.qty,
      amount: l.lineTotal,
      note: l.confirmRequired ? t.subjectToConfirmation : ''
    }));
    rows.push({ label: t.rowAddonsTotal, amount: quote.addonsTotal, strong: true });
    return rows;
  }

  // ---- Browser part ----
  let catalog = [];
  let selection = {};
  let ready = false;
  const listeners = [];

  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify(selection)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function changed() {
    save();
    render();
    listeners.forEach((fn) => fn());
  }

  function unitLabel(unit) {
    const L = (window.NSG.UI && window.NSG.UI.labels) || {};
    return { per_guest: L.unitPerPerson, flat: L.unitPerBooking, per_night: L.unitPerNight, per_qty: L.unitEach }[unit] || '';
  }

  function render() {
    const box = document.getElementById('addons-list');
    const section = document.getElementById('addons-step');
    if (!box || !section) return;
    section.hidden = !ready || catalog.length === 0;
    const t = ui();
    const config = window.NSG.CONFIG || {};
    const wa = config.WHATSAPP && !String(config.WHATSAPP).startsWith('[TBD') ? 'https://wa.me/' + config.WHATSAPP : 'contact.html';
    const groups = [['food', t.groupFood], ['travel', t.groupTravel], ['car', t.groupCar], ['other', t.groupOther]];
    box.innerHTML = groups.map(([cat, title]) => {
      const items = catalog.filter((a) => (cat === 'other' ? !['food', 'travel', 'car'].includes(a.category) : a.category === cat));
      if (!items.length) return '';
      return `<div class="addons-group"><h3 class="addons-group-title">${esc(title)}</h3>${items.map((a) => {
        const on = !!selection[a.id];
        const priced = a.price !== null;
        const action = !priced
          ? `<a class="btn btn-ghost btn-sm" href="${wa}"${wa.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc((window.NSG.UI.labels || {}).askOnWhatsApp)}</a>`
          : `<button type="button" class="btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'} addon-toggle" data-id="${esc(a.id)}" aria-pressed="${on}">${esc(on ? t.added : t.add)}</button>`;
        const stepper = on && a.unit === 'per_qty'
          ? `<span class="addon-qty" role="group" aria-label="${esc(t.qtyLabel)}"><button type="button" class="addon-qty-btn" data-id="${esc(a.id)}" data-step="-1" aria-label="${esc(t.decrease)}">−</button><span class="addon-qty-val" aria-live="polite">${selection[a.id]}</span><button type="button" class="addon-qty-btn" data-id="${esc(a.id)}" data-step="1" aria-label="${esc(t.increase)}"${selection[a.id] >= a.maxQty ? ' disabled' : ''}>+</button></span>`
          : '';
        return `<article class="addon-item${on ? ' is-on' : ''}">
          <div class="addon-info">
            <h4 class="addon-name">${esc(a.name)}</h4>
            ${a.description ? `<p class="addon-desc">${esc(a.description)}</p>` : ''}
            <p class="addon-price">${priced ? inr(a.price) + ' <span>' + esc(unitLabel(a.unit)) + '</span>' : esc((window.NSG.UI.labels || {}).priceOnRequest)}${a.confirmRequired ? ' · <em>' + esc(t.subjectToConfirmation) + '</em>' : ''}</p>
          </div>
          <div class="addon-actions">${stepper}${action}</div>
        </article>`;
      }).join('')}</div>`;
    }).join('');
  }

  function onClick(e) {
    const toggle = e.target.closest('.addon-toggle');
    const step = e.target.closest('.addon-qty-btn');
    const target = toggle || step;
    if (!target) return;
    const item = catalog.find((a) => a.id === target.getAttribute('data-id'));
    if (!item) return;
    if (toggle) selection = selection[item.id] ? remove(selection, item.id) : add(selection, item, 1);
    else selection = setQty(selection, item, (selection[item.id] || 0) + Number(step.getAttribute('data-step')));
    changed();
    const again = document.querySelector(`.addon-toggle[data-id="${CSS.escape(item.id)}"]`);
    if (again && toggle) again.focus();
  }

  /** Loads the list; keeps only selections that still exist and are bookable */
  function reload() {
    if (!window.NSG.api || typeof window.NSG.api.addons !== 'function') return Promise.resolve();
    return window.NSG.api.addons().then((res) => {
      const carsOn = !!((window.NSG.CONFIG || {}).FEATURES || {}).cars;
      catalog = res && res.ok ? res.data.filter((a) => carsOn || a.category !== 'car') : [];
      const kept = {};
      Object.keys(selection).forEach((id) => {
        const item = catalog.find((a) => a.id === id && a.price !== null);
        if (item) kept[id] = item.unit === 'per_qty' ? Math.min(item.maxQty, selection[id]) : 1;
      });
      const before = JSON.stringify(selection);
      selection = kept;
      if (JSON.stringify(kept) !== before) changed();
      else render();
    });
  }

  function init() {
    const box = document.getElementById('addons-list');
    if (!box) return;
    selection = load();
    box.addEventListener('click', onClick);
    const skip = document.getElementById('addons-skip');
    if (skip) {
      skip.addEventListener('click', () => {
        selection = {};
        changed();
        const cont = document.getElementById('btn-step1-continue');
        if (cont) cont.click();
      });
    }
    reload().then(() => {
      let param = '';
      try { param = new URLSearchParams(location.search).get('addons') || ''; } catch (e) {}
      if (param) {
        selection = Object.assign({}, selection, parseParam(param, catalog));
        changed();
      }
    });
  }

  window.NSG.Addons = {
    add: add, remove: remove, setQty: setQty, parseParam: parseParam, toList: toList, summaryRows: summaryRows,
    list: () => toList(selection),
    picked: () => toList(selection).map((s) => Object.assign({ qty: s.qty }, catalog.find((a) => a.id === s.id) || { name: s.id })),
    onChange: (fn) => listeners.push(fn),
    setReady: (on) => { ready = !!on; render(); },
    reload: reload,
    clear: () => { selection = {}; save(); render(); }
  };

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})();
