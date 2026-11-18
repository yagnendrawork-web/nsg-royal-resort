/* NSG ROYAL RESORT — staff.js: hidden staff app core (staff.html). PIN screen, home tiles, bookings &
   calendar, booking detail actions and block dates. The new-link wizard, check and result screens are in
   staff-link.js (window.NSG.Staff.views). State lives in memory; only the device id and the session token
   (api.link.js) are persisted. Text: site.json "staff". */
window.NSG = window.NSG || {};
(function () {
  'use strict';
  const app = document.getElementById('staff-app');
  if (!app || !window.NSG.api || !window.NSG.api.staffLogin) return;
  const api = window.NSG.api;
  const F = api.fmt;
  const inr = F.inr;
  let t = {};
  try { t = JSON.parse(document.getElementById('staff-text').textContent); } catch (e) {}
  let rt = {}; // site.json reviews.staff
  try { rt = JSON.parse(document.getElementById('reviews-staff-text').textContent); } catch (e) {}
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const icon = (id, size) => `<svg width="${size || 20}" height="${size || 20}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const $ = (id) => document.getElementById(id);
  const DEVICE_KEY = 'nsg_staff_device';
  const ACTIVE = ['HOLD', 'PAYMENT_SUBMITTED', 'CONFIRMED'];
  const PILL = { HOLD: ['hold', 'i-clock'], PAYMENT_SUBMITTED: ['pending', 'i-hourglass'], CONFIRMED: ['confirmed', 'i-check'], EXPIRED: ['closed', 'i-cross'], CANCELLED: ['closed', 'i-cross'], REJECTED: ['closed', 'i-cross'], BLOCKED: ['blocked', 'i-lock'] };

  const S = window.NSG.Staff = {
    t: t, api: api, esc: esc, fill: fill, icon: icon, inr: inr, views: {},
    state: { view: 'pin', me: '', data: null, loadedAt: 0, filter: { status: '', source: '' }, month: '', dayPick: '', afterAuth: '', pin: '', pinError: '', pinBusy: false, pinShake: false }
  };
  const st = S.state;
  const today = F.today;
  const addDays = F.addDays;

  // ---- UI primitives shared with staff-link.js ----
  S.toast = function (msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('sf-toast').appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };
  S.sheet = function (html, bind) {
    const host = $('sf-sheet');
    host.innerHTML = `<div class="modal-backdrop sf-backdrop" id="sf-backdrop"><div class="modal-content sf-sheet" role="dialog" aria-modal="true"><button type="button" class="modal-close sf-close" id="sf-close" aria-label="${esc(t.nav.close)}">${icon('i-cross', 18)}</button>${html}</div></div>`;
    $('sf-backdrop').addEventListener('click', (e) => { if (e.target.id === 'sf-backdrop') S.closeSheet(); });
    $('sf-close').addEventListener('click', S.closeSheet);
    if (bind) bind(host);
  };
  S.closeSheet = () => { $('sf-sheet').innerHTML = ''; };
  /** Confirm dialog that repeats the key facts; resolves true/false */
  S.confirm = (text, okLabel) => new Promise((resolve) => {
    S.sheet(`<p class="sf-ask">${esc(text)}</p><div class="sf-row2"><button type="button" class="btn btn-secondary btn-lg" id="sf-no">${esc(t.nav.no)}</button><button type="button" class="btn btn-primary btn-lg" id="sf-yes">${esc(okLabel || t.nav.yes)}</button></div>`, () => {
      $('sf-no').addEventListener('click', () => { S.closeSheet(); resolve(false); });
      $('sf-yes').addEventListener('click', () => { S.closeSheet(); resolve(true); });
    });
  });
  S.banner = function (msg, retry) {
    const host = $('sf-alert');
    host.innerHTML = `<div class="sf-banner" role="alert"><span>${esc(msg || t.errors.generic)}</span>${retry ? `<button type="button" class="btn btn-secondary btn-sm" id="sf-retry">${esc(t.nav.retry)}</button>` : ''}<button type="button" class="sf-iconbtn" id="sf-alert-x" aria-label="${esc(t.nav.close)}">${icon('i-cross', 16)}</button></div>`;
    $('sf-alert-x').addEventListener('click', () => { host.innerHTML = ''; });
    if (retry) $('sf-retry').addEventListener('click', () => { host.innerHTML = ''; retry(); });
  };
  S.conflictText = (c) => fill(t.detail.conflict, { date: F.dayLabel(c.date || ''), status: t.status[c.status] || c.status, name: c.name || '—', source: t.source[c.source] || c.source });
  /** Runs an API call. AUTH is handled by the nsg:staff-auth listener (PIN screen, then back here); other errors -> banner with Retry */
  S.call = async function (fn, retry) {
    const r = await fn();
    if (!r.ok) {
      if (r.code !== 'AUTH') S.banner(r.conflict ? S.conflictText(r.conflict) : r.code === 'NETWORK' ? t.errors.network : (r.detail || r.error), retry);
    }
    return r;
  };
  /** Brand loader with a status line (template in staff.html, partials/loader.html) */
  S.loading = (text) => `<div class="nsg-loading" role="status">${(document.getElementById('nsg-loader-tpl') || {}).innerHTML || ''}<p>${esc(text)}</p></div>`;
  S.pill = (status) => { const p = PILL[status] || PILL.EXPIRED; return `<span class="st st--${p[0]}">${icon(p[1], 14)}${esc(t.status[status] || status)}</span>`; };
  S.special = (b) => (b.isSpecialPrice ? `<span class="st st--special">${icon('i-star', 12)}${esc(t.special)}</span>` : '');
  S.dates = (b) => `${F.dayLabel(b.checkIn)} – ${F.dayLabel(b.checkOut)}`;
  S.when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
  S.bar = (adv, total, ok) => { const pct = total ? Math.min(100, Math.round(adv / total * 100)) : 0; return `<div class="sf-bar${ok ? ' is-ok' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></div>`; };
  S.money = (b) => {
    const ok = b.status === 'CONFIRMED';
    const adv = ok ? b.advancePaid : b.advance;
    return `<div class="sf-money"><div><small>${esc(t.form.total)}</small><strong>${inr(b.total)}</strong></div><div><small>${esc(t.form.advance)}</small><strong>${inr(adv)}</strong></div><div><small>${esc(t.form.balance)}</small><strong>${inr(b.remaining !== undefined ? b.remaining : b.balance)}</strong></div></div>${S.bar(adv, b.total, ok)}`;
  };
  S.updated = () => {
    if (!st.loadedAt) return '';
    const s = Math.round((Date.now() - st.loadedAt) / 1000);
    return fill(t.home.updated, { time: s < 10 ? t.home.justNow : s < 60 ? fill(t.home.secondsAgo, { n: s }) : fill(t.home.minutesAgo, { n: Math.round(s / 60) }) });
  };
  S.go = function (view, extra) {
    Object.assign(st, extra || {});
    st.view = view;
    S.closeSheet();
    render();
    window.scrollTo(0, 0);
  };
  S.bindGo = () => app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => S.go(b.getAttribute('data-go'), b.getAttribute('data-go') === 'new' ? { fresh: true } : {})));

  // ---- data: bookings, blocks and day states for today-7 .. today+180 ----
  S.refresh = async function (silent) {
    const from = addDays(today(), -7), to = addDays(today(), 180);
    const [l, c] = await Promise.all([api.staffList(from, to), api.staffCalendar(from, to)]);
    if (!l.ok) {
      if (l.code !== 'AUTH' && !silent) S.banner(l.detail || l.error, () => S.refresh());
      return false;
    }
    st.data = { bookings: l.data.bookings, blocks: l.data.blocks, days: c.ok ? c.data.days : [] };
    st.loadedAt = Date.now();
    if (['home', 'list', 'block'].includes(st.view)) render();
    return true;
  };
  S.dayState = (d) => { const row = st.data && st.data.days.find((x) => x.date === d); return row ? row.state : 'free'; };
  /** "Sat 14 Nov: Hold · Ravi (Pay link)" for a night, or "" when free */
  S.holder = (d) => {
    if (!st.data) return '';
    const b = st.data.bookings.find((x) => ACTIVE.includes(x.status) && x.checkIn <= d && x.checkOut > d);
    if (b) return fill(t.form.whoHolds, { date: F.dayLabel(d), status: t.status[b.status], name: b.firstName, source: t.source[b.source] || b.source });
    if (st.data.blocks.some((x) => x.date === d)) return fill(t.form.blockedDay, { date: F.dayLabel(d) });
    return '';
  };
  S.legend = () => `<p class="sf-legend">${['free', 'hold', 'pending', 'confirmed', 'blocked'].map((s) => `<span class="sf-day--${s}"><i></i>${esc(t.form.legend[s])}</span>`).join('')}</p>`;
  S.pkgLabel = (b) => b.packageName || t.eventNames[b.eventType] || b.eventType || '';

  // ---- top bar ----
  $('sf-refresh').addEventListener('click', async () => {
    $('sf-refresh').classList.add('is-spin');
    if (await S.refresh()) S.toast(t.home.refreshed);
    $('sf-refresh').classList.remove('is-spin');
  });
  $('sf-logout').addEventListener('click', async () => { await api.staffLogout(); st.me = ''; st.data = null; st.afterAuth = ''; S.form = null; S.go('pin'); });

  // ---- PIN screen: 6 dots + keypad; shake on a wrong PIN; lockout message ----
  function deviceId() {
    let d = null;
    try {
      d = localStorage.getItem(DEVICE_KEY);
      if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, d); }
    } catch (e) { d = 'no-storage'; }
    return d;
  }
  function viewPin() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    app.innerHTML = `<section class="sf-pin${st.pinShake ? ' is-shake' : ''}">
      <img src="assets/img/logo-md.png" alt="" width="72" height="72" class="sf-pin-logo">
      <h2>${esc(t.pin.title)}</h2>
      <div class="sf-dots" aria-label="${esc(t.pin.hint)}">${[0, 1, 2, 3, 4, 5].map((i) => `<span class="${i < st.pin.length ? 'is-on' : ''}"></span>`).join('')}</div>
      <p class="sf-pin-msg${st.pinError ? ' is-err' : ''}" role="alert">${esc(st.pinError || (st.pinBusy ? t.pin.checking : t.pin.hint))}</p>
      <div class="sf-keys">${keys.map((k) => (k === '' ? '<span></span>' : `<button type="button" class="sf-key" data-key="${k}" aria-label="${k === 'del' ? esc(t.pin.delete) : k}">${k === 'del' ? icon('i-back', 22) : k}</button>`)).join('')}</div>
    </section>`;
    st.pinShake = false;
    app.querySelector('.sf-keys').addEventListener('click', (e) => {
      const key = e.target.closest('.sf-key');
      if (!key || st.pinBusy) return;
      const k = key.getAttribute('data-key');
      st.pin = k === 'del' ? st.pin.slice(0, -1) : (st.pin + k).slice(0, 6);
      st.pinError = '';
      viewPin();
      if (st.pin.length === 6) login();
    });
  }
  async function login() {
    st.pinBusy = true;
    viewPin();
    const r = await api.staffLogin(st.pin, deviceId());
    st.pinBusy = false;
    st.pin = '';
    if (!r.ok) {
      st.pinError = r.code === 'LOCKED' ? fill(t.pin.locked, { n: r.lockedMinutes || 15 }) : r.code === 'NETWORK' ? t.errors.network : t.pin.wrong;
      st.pinShake = true;
      return viewPin();
    }
    st.pinError = '';
    st.me = r.data.name;
    const back = st.afterAuth && st.afterAuth !== 'pin' ? st.afterAuth : 'home';
    st.afterAuth = '';
    S.go(back);
    S.refresh(true);
  }

  // ---- Home: today's tiles + three big actions ----
  function viewHome() {
    const td = today();
    const rows = st.data ? st.data.bookings : [];
    const tiles = [
      ['arriving', 'i-home', rows.filter((b) => b.checkIn === td && ACTIVE.includes(b.status)).length, 'ARRIVING'],
      ['awaiting', 'i-clock', rows.filter((b) => b.status === 'HOLD').length, 'HOLD'],
      ['toConfirm', 'i-hourglass', rows.filter((b) => b.status === 'PAYMENT_SUBMITTED').length, 'PAYMENT_SUBMITTED'],
      ['balance', 'i-rupee', rows.filter((b) => b.status === 'CONFIRMED' && b.remaining > 0).length, 'BALANCE']
    ];
    app.innerHTML = `<section class="sf-home">
      <p class="sf-updated">${esc(st.data ? S.updated() : t.home.loading)}</p>
      <div class="sf-tiles">${tiles.map(([k, ic, n, f]) => `<button type="button" class="sf-tile sf-tile--${k}" data-status="${f}">${icon(ic, 22)}<strong>${st.data ? n : '…'}</strong><span>${esc(t.home[k])}</span></button>`).join('')}</div>
      <div class="sf-actions">
        <button type="button" class="btn btn-primary btn-lg" data-go="new">${icon('i-link')}${esc(t.home.newLink)}</button>
        <button type="button" class="btn btn-secondary btn-lg" data-go="block">${icon('i-lock')}${esc(t.home.block)}</button>
        <button type="button" class="btn btn-secondary btn-lg" data-go="list">${icon('i-calendar')}${esc(t.home.bookings)}</button>
      </div></section>`;
    app.querySelectorAll('.sf-tile').forEach((b) => b.addEventListener('click', () => { st.filter = { status: b.getAttribute('data-status'), source: '' }; st.dayPick = ''; S.go('list'); }));
    S.bindGo();
  }

  // ---- Bookings & calendar: month with coloured dots, filters, rows grouped by date ----
  const matches = (b) => {
    const f = st.filter;
    if (f.status === 'ARRIVING') return b.checkIn === today() && ACTIVE.includes(b.status);
    if (f.status === 'BALANCE') return b.status === 'CONFIRMED' && b.remaining > 0;
    if (f.status && b.status !== f.status) return false;
    return !f.source || b.source === f.source;
  };
  function monthGrid(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = '';
    for (let i = 0; i < first.getUTCDay(); i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const ds = `${ym}-${String(d).padStart(2, '0')}`;
      cells += `<button type="button" class="sf-day sf-day--${S.dayState(ds)}${ds === today() ? ' is-today' : ''}${st.dayPick === ds ? ' is-picked' : ''}" data-date="${ds}"><span>${d}</span><i></i></button>`;
    }
    return `<div class="sf-month"><div class="sf-month-nav"><button type="button" class="sf-iconbtn" data-nav="-1" aria-label="Previous month">${icon('i-back', 18)}</button><strong>${first.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button type="button" class="sf-iconbtn" data-nav="1" aria-label="Next month">${icon('i-next', 18)}</button></div><div class="sf-grid">${'SMTWTFS'.split('').map((w) => `<b>${w}</b>`).join('')}${cells}</div></div>`;
  }
  function row(b) {
    const adv = b.status === 'CONFIRMED' ? b.advancePaid : b.advance;
    return `<button type="button" class="sf-rowbtn sf-row--${(PILL[b.status] || PILL.EXPIRED)[0]}" data-id="${esc(b.bookingId)}">
      <div class="sf-row-top">${S.pill(b.status)}<strong>${esc(b.firstName)} · ${esc(b.phoneLast4)}</strong>${S.special(b)}</div>
      <div class="sf-row-mid">${icon('i-calendar', 14)}${esc(S.dates(b))} · ${icon('i-people', 14)}${b.guests} · ${esc(S.pkgLabel(b))}</div>
      <div class="sf-row-money"><span>${inr(b.total)}</span><span>${esc(t.form.advance)} ${inr(adv)}</span><span>${esc(t.form.balance)} ${inr(b.remaining)}</span></div>
      <div class="sf-row-foot">${esc(t.source[b.source] || b.source)}${b.createdBy ? ' · ' + esc(fill(t.list.by, { name: b.createdBy })) : ''}</div></button>`;
  }
  function viewList() {
    if (!st.month) st.month = today().slice(0, 7);
    const rows = (st.data ? st.data.bookings : []).filter(matches).filter((b) => !st.dayPick || (b.checkIn <= st.dayPick && b.checkOut > st.dayPick));
    const groups = {};
    rows.forEach((b) => { (groups[b.checkIn] = groups[b.checkIn] || []).push(b); });
    const chip = (key, val, label) => `<button type="button" class="chip${st.filter[key] === val ? ' is-active' : ''}" data-f="${key}" data-v="${val}" aria-pressed="${st.filter[key] === val}">${esc(label)}</button>`;
    app.innerHTML = `<section class="sf-list">
      <div class="sf-head"><button type="button" class="sf-back" data-go="home">${icon('i-back', 20)}${esc(t.nav.home)}</button><h2>${esc(t.list.title)}</h2><span class="sf-updated">${esc(S.updated())}</span></div>
      ${monthGrid(st.month)}${S.legend()}
      <div class="chip-group sf-chips">${chip('status', '', t.list.all)}${['HOLD', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'EXPIRED', 'CANCELLED'].map((s) => chip('status', s, t.status[s])).join('')}</div>
      <div class="chip-group sf-chips">${chip('source', '', t.list.all)}${['web', 'link', 'walkin'].map((s) => chip('source', s, t.source[s])).join('')}</div>
      ${st.dayPick ? `<p class="sf-daypick">${esc(S.holder(st.dayPick) || F.dayLabel(st.dayPick) + ': ' + t.status.free)} <button type="button" class="pay-link-btn" id="sf-clearday">${esc(t.list.all)}</button></p>` : ''}
      <div class="sf-rows">${Object.keys(groups).sort().map((d) => `<h3 class="sf-date">${esc(F.dayLabel(d))}</h3>${groups[d].map(row).join('')}`).join('') || `<p class="sf-empty">${esc(t.list.empty)}</p>`}</div>
    </section>`;
    S.bindGo();
    app.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      const [y, m] = st.month.split('-').map(Number);
      st.month = new Date(Date.UTC(y, m - 1 + Number(b.getAttribute('data-nav')), 1)).toISOString().slice(0, 7);
      viewList();
    }));
    app.querySelectorAll('.sf-day').forEach((b) => b.addEventListener('click', () => { const d = b.getAttribute('data-date'); st.dayPick = st.dayPick === d ? '' : d; viewList(); }));
    app.querySelectorAll('.sf-chips .chip').forEach((c) => c.addEventListener('click', () => { st.filter[c.getAttribute('data-f')] = c.getAttribute('data-v'); viewList(); }));
    const clr = $('sf-clearday');
    if (clr) clr.addEventListener('click', () => { st.dayPick = ''; viewList(); });
    app.querySelectorAll('.sf-rowbtn').forEach((r) => r.addEventListener('click', () => openDetail(r.getAttribute('data-id'))));
  }

  // ---- Booking detail sheet with context-aware actions ----
  async function openDetail(id) {
    const r = await S.call(() => api.staffBooking(id), () => openDetail(id));
    if (!r.ok) return;
    const b = r.data.booking;
    const act = (a, label, cls, ic) => `<button type="button" class="btn ${cls || 'btn-secondary'} btn-md" data-act="${a}">${icon(ic || 'i-check', 18)}${esc(label)}</button>`;
    const danger = (a, label) => act(a, label, 'btn-ghost sf-danger', 'i-cross');
    const acts = {
      HOLD: act('resend', t.detail.resend, 'btn-primary', 'i-wa') + act('edit', t.detail.edit, '', 'i-edit') + act('extend6', t.detail.extend6, '', 'i-clock') + act('extend24', t.detail.extend24, '', 'i-clock') + danger('cancel', t.detail.cancel),
      PAYMENT_SUBMITTED: `<div class="sf-utr"><div><small>${esc(t.detail.utr)}</small><strong>${esc(b.utr || '—')}</strong></div><div><small>${esc(t.detail.expected)}</small><strong class="sf-big">${inr(b.advance)}</strong></div></div>
        <label class="form-label" for="sf-recv">${esc(t.detail.received)}</label><input class="form-input sf-amt" id="sf-recv" inputmode="numeric" value="${b.advance}">` + act('confirm', t.detail.confirm, 'btn-primary', 'i-check') + danger('reject', t.detail.reject) + act('edit', t.detail.edit, '', 'i-edit'),
      CONFIRMED: (b.remaining > 0 ? act('collect', t.detail.collect, 'btn-primary', 'i-rupee') : '') + (b.checkOut < today() ? act('review', rt.ask, '', 'i-star') : '') + (b.payUrl ? `<a class="btn btn-secondary btn-md" href="${esc(b.payUrl)}" target="_blank" rel="noopener">${icon('i-link', 18)}${esc(t.detail.viewGuest)}</a>` : '') + danger('cancel', t.detail.cancel),
      EXPIRED: act('extend6', t.detail.extend6, 'btn-primary', 'i-clock') + act('extend24', t.detail.extend24, '', 'i-clock') + act('newsame', t.detail.newSame, '', 'i-link')
    };
    const kv = (ic, html) => `<p class="sf-kv">${icon(ic, 16)}<span>${html}</span></p>`;
    S.sheet(`<div class="sf-detail">
      <div class="sf-row-top">${S.pill(b.status)}${S.special(b)}<span class="st st--closed">${esc(t.source[b.source] || b.source)}</span></div>
      <h2>${esc(b.name)}</h2>
      ${kv('i-phone', `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a> · <a href="https://wa.me/91${esc(b.phone)}" target="_blank" rel="noopener">WhatsApp</a>`)}
      ${kv('i-calendar', `${esc(S.dates(b))} · ${esc(b.nights === 1 ? t.form.nightsOne : fill(t.form.nightsMany, { n: b.nights }))} · ${esc(fill(t.form.guestsN, { n: b.guests }))}`)}
      ${kv('i-home', esc(S.pkgLabel(b)))}
      ${b.addons.length ? `<div class="pay-chips">${b.addons.map((a) => `<span class="chip">${esc(a.name)} × ${a.qty}</span>`).join('')}</div>` : ''}
      ${S.money(b)}
      ${b.status === 'CONFIRMED' ? kv('i-rupee', `${esc(t.detail.balancePaid)} <strong>${inr(b.balancePaid)}</strong>${b.balanceMethod ? ' · ' + esc(t.detail[b.balanceMethod] || b.balanceMethod) : ''} · ${esc(t.detail.remaining)} <strong>${inr(b.remaining)}</strong>`) : ''}
      ${b.status === 'HOLD' && b.holdExpiresAt ? kv('i-clock', esc(fill(t.detail.holdTill, { time: S.when(b.holdExpiresAt) }))) : ''}
      ${b.priceNote ? kv('i-star', `<small>${esc(t.detail.priceNote)}:</small> ${esc(b.priceNote)}`) : ''}
      ${b.staffNote ? kv('i-edit', `<small>${esc(t.detail.staffNote)}:</small> ${esc(b.staffNote)}`) : ''}
      ${b.notes ? kv('i-people', `<small>${esc(t.detail.notes)}:</small> ${esc(b.notes)}`) : ''}
      <p class="sf-muted">${esc(b.bookingId)}${b.createdBy ? ' · ' + esc(fill(t.list.by, { name: b.createdBy })) : ''}</p>
      <div class="sf-detail-acts">${acts[b.status] || ''}</div>
    </div>`, (host) => host.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => action(el.getAttribute('data-act'), b, host))));
  }
  async function action(a, b, host) {
    const vars = { name: b.firstName, dates: S.dates(b) };
    const reopen = () => openDetail(b.bookingId);
    const done = async (msg) => { S.closeSheet(); if (msg) S.toast(msg); await S.refresh(true); };
    if (a === 'resend') {
      const r = await S.call(() => api.staffResendMessage(b.bookingId));
      if (r.ok) window.open(r.data.waUrl, '_blank', 'noopener');
    } else if (a === 'review') {
      const r = await S.call(() => api.staffReviewMessage(b.bookingId));
      if (r.ok) window.open(r.data.waUrl, '_blank', 'noopener');
      else if (r.code === 'NO_REVIEW_URL') S.banner(rt.noUrl);
    } else if (a === 'edit') {
      S.closeSheet();
      S.go('new', { editFrom: b });
    } else if (a === 'newsame') {
      S.closeSheet();
      S.go('new', { copyFrom: b });
    } else if (a === 'extend6' || a === 'extend24') {
      const n = a === 'extend6' ? 6 : 24;
      if (!(await S.confirm(fill(t.detail.confirmExtend, Object.assign({ n: n }, vars))))) return reopen();
      const r = await S.call(() => api.staffExtendHold(b.bookingId, n));
      if (r.ok) done(fill(r.data.revived ? t.detail.revived : t.detail.extended, { time: S.when(r.data.holdExpiresAt) }));
    } else if (a === 'cancel') {
      if (!(await S.confirm(fill(t.detail.confirmCancel, vars), t.detail.cancel))) return reopen();
      const r = await S.call(() => api.staffCancel(b.bookingId, ''));
      if (r.ok) done(t.detail.cancelled);
    } else if (a === 'reject') {
      if (!(await S.confirm(fill(t.detail.confirmReject, Object.assign({ amount: inr(b.advance) }, vars)), t.detail.reject))) return reopen();
      const r = await S.call(() => api.staffReject(b.bookingId));
      if (r.ok) done(t.detail.rejected);
    } else if (a === 'confirm') {
      const amt = Math.round(Number(host.querySelector('#sf-recv').value)) || 0;
      if (!(await S.confirm(fill(t.detail.confirmConfirm, Object.assign({ amount: inr(amt) }, vars)), t.detail.confirm))) return reopen();
      const r = await S.call(() => api.staffConfirm(b.bookingId, amt));
      if (r.ok) done((r.data.warnings || [])[0] || t.detail.confirmed);
    } else if (a === 'collect') {
      collect(b);
    }
  }
  function collect(b) {
    let method = 'cash';
    S.sheet(`<div class="sf-detail"><h2>${esc(t.detail.collect)}</h2>
      <p class="sf-kv">${esc(b.firstName)} · ${esc(t.detail.remaining)} <strong>${inr(b.remaining)}</strong></p>
      <label class="form-label" for="sf-amt">${esc(t.detail.amount)}</label><input class="form-input sf-amt" id="sf-amt" inputmode="numeric" value="${b.remaining}">
      <div class="chip-group" id="sf-method">${['cash', 'upi', 'other'].map((m) => `<button type="button" class="chip${m === method ? ' is-active' : ''}" data-m="${m}" aria-pressed="${m === method}">${esc(t.detail[m])}</button>`).join('')}</div>
      <button type="button" class="btn btn-primary btn-lg" id="sf-collect">${icon('i-rupee', 18)}${esc(t.detail.collect)}</button></div>`, (host) => {
      host.querySelectorAll('#sf-method .chip').forEach((c) => c.addEventListener('click', () => {
        method = c.getAttribute('data-m');
        host.querySelectorAll('#sf-method .chip').forEach((x) => { const on = x === c; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', on); });
      }));
      $('sf-collect').addEventListener('click', async () => {
        const amt = Math.round(Number($('sf-amt').value)) || 0;
        if (!(await S.confirm(fill(t.detail.confirmCollect, { amount: inr(amt), method: t.detail[method], name: b.firstName }), t.detail.collect))) return collect(b);
        const r = await S.call(() => api.staffCollectBalance(b.bookingId, amt, method));
        if (r.ok) { S.closeSheet(); S.toast(fill(t.detail.collected, { amount: inr(r.data.remaining) })); S.refresh(true); }
      });
    });
  }

  // ---- Block dates: calendar.js in single mode, multi-select by tapping; tap a blocked date to unblock ----
  function viewBlock() {
    const picked = st.blockPick || (st.blockPick = new Set());
    app.innerHTML = `<section class="sf-block">
      <div class="sf-head"><button type="button" class="sf-back" data-go="home">${icon('i-back', 20)}${esc(t.nav.home)}</button><h2>${esc(t.block.title)}</h2></div>
      <p class="sf-hint">${esc(t.block.hint)}</p>
      <div class="staff-cal" id="sf-cal"></div>${S.legend()}
      <label class="form-label" for="sf-bnote">${esc(t.block.note)}</label><input class="form-input" id="sf-bnote" value="${esc(st.blockNote || '')}">
      <button type="button" class="btn btn-primary btn-lg" id="sf-bsave"${picked.size ? '' : ' disabled'}>${icon('i-lock', 18)}${esc(fill(t.block.save, { n: picked.size }))}</button></section>`;
    S.bindGo();
    const cal = new window.NSG.Calendar($('sf-cal'), {
      mode: 'single', legend: false, months: 1,
      dayClass: (d) => `sf-cal-${S.dayState(d)}${picked.has(d) ? ' is-picked' : ''}`,
      onSelect: (r) => {
        const d = r.checkIn;
        cal.setDates(null, null);
        const s = S.dayState(d);
        if (s === 'blocked') return askUnblock(d);
        if (s !== 'free') return S.toast(S.holder(d));
        if (picked.has(d)) picked.delete(d); else picked.add(d);
        cal.render();
        $('sf-bsave').disabled = !picked.size;
        $('sf-bsave').innerHTML = icon('i-lock', 18) + esc(fill(t.block.save, { n: picked.size }));
      }
    });
    $('sf-bnote').addEventListener('input', (e) => { st.blockNote = e.target.value; });
    $('sf-bsave').addEventListener('click', async () => {
      const r = await S.call(() => api.staffBlock(Array.from(picked).sort(), st.blockNote || ''));
      if (!r.ok) return;
      picked.clear();
      st.blockNote = '';
      S.toast(fill(t.block.saved, { n: r.data.blocked.length }));
      await S.refresh(true);
      viewBlock();
    });
  }
  async function askUnblock(d) {
    if (!(await S.confirm(fill(t.block.unblockAsk, { date: F.dayLabel(d) })))) return;
    const r = await S.call(() => api.staffUnblock([d]));
    if (r.ok) { S.toast(fill(t.block.unblocked, { date: F.dayLabel(d) })); await S.refresh(true); viewBlock(); }
  }

  // ---- router ----
  function render() {
    $('sf-top').hidden = st.view === 'pin';
    $('sf-me').textContent = st.me;
    $('sf-alert').innerHTML = '';
    const core = { pin: viewPin, home: viewHome, list: viewList, block: viewBlock };
    (core[st.view] || S.views[st.view] || viewHome)();
  }
  window.addEventListener('nsg:staff-auth', () => { if (st.view !== 'pin') { st.afterAuth = st.view; S.go('pin'); } });

  (async function boot() {
    if (api.getStaffToken()) {
      const r = await api.staffMe();
      if (r.ok) { st.me = r.data.name; S.go('home'); S.refresh(true); return; }
    }
    S.go('pin');
  })();
})();
