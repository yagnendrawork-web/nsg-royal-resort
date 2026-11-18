/* NSG ROYAL RESORT — staff-link.js: the staff app's "New booking link" wizard (one screen, sections unlock
   in order, live Total / Advance / Balance bar), the check screen (staffQuote warnings; create or save with a
   requestId reused on retry) and the result screen (WhatsApp, copy). Also edits a pay-link booking. */
window.NSG = window.NSG || {};
(function () {
  'use strict';
  const S = window.NSG.Staff;
  if (!S) return;
  const t = S.t, api = S.api, esc = S.esc, fill = S.fill, icon = S.icon, inr = S.inr, st = S.state;
  const F = api.fmt;
  const $ = (id) => document.getElementById(id);
  const app = () => $('staff-app');
  const HOLD = [6, 12, 24, 48];
  const QUICK = [8, 10, 12, 15, 20, 25];
  let info = null, foods = [], quoteTimer = 0, lookupTimer = 0;
  const blank = () => ({ phone: '', name: '', lookup: null, type: 'stay', pkg: '', ev: '', checkIn: '', checkOut: '', guests: 0, addons: {}, special: false, specialTotal: '', advance: '', advanceLocked: false, noAdvance: false, note: '', hold: 24, quote: null, quoteErr: '', editId: '', requestId: '' });
  let f = S.form || (S.form = blank());

  async function ensureData() {
    if (!info) { const r = await api.getInfo(); info = r.ok ? r.data : { packages: [], eventTypes: [] }; }
    if (!foods.length) { const r = await api.addons(); foods = r.ok ? r.data.filter((a) => a.category === 'food' && a.price !== null) : []; }
    if (!st.data) await S.refresh(true);
  }
  // ---- derived values (the server quote gives the standard total; the rest is instant local maths) ----
  const pkg = () => info.packages.find((p) => p.id === f.pkg);
  const ev = () => info.eventTypes.find((e) => e.id === f.ev);
  const isEvent = () => f.type === 'event';
  const standard = () => (f.quote && f.quote.standardTotal) || null;
  const finalTotal = () => ((f.special || isEvent()) && Number(f.specialTotal) > 0 ? Math.round(Number(f.specialTotal)) : standard());
  const minAdv = () => (f.quote && f.quote.minAdvance) || 1000;
  const defAdv = () => ((isEvent() ? (ev() || {}).advance : (pkg() || {}).advance) || minAdv());
  const advance = () => (f.noAdvance ? 0 : f.advance === '' ? defAdv() : Math.round(Number(f.advance) || 0));
  const balance = () => Math.max(0, (finalTotal() || 0) - advance());
  const advOk = () => f.noAdvance || (finalTotal() !== null && advance() >= minAdv() && advance() <= finalTotal());
  // Stay limit includes paid extra guests when the package allows them
  const maxGuests = () => { const p = pkg() || {}; return isEvent() ? 500 : (p.maxGuests || 100) + (p.extraGuestFee ? p.maxExtraGuests || 0 : 0); };
  const nightsText = (n) => (n === 1 ? t.form.nightsOne : fill(t.form.nightsMany, { n: n }));
  const label = () => (isEvent() ? t.eventNames[f.ev] || f.ev : (pkg() || {}).name || '');
  function payload() {
    const p = { bookingType: f.type, checkIn: f.checkIn, checkOut: f.checkOut, guests: f.guests, addons: Object.keys(f.addons).map((id) => ({ id: id, qty: f.addons[id] })) };
    if (isEvent()) p.eventType = f.ev; else p.package = f.pkg;
    if ((f.special || isEvent()) && f.specialTotal !== '') p.specialTotal = Number(f.specialTotal);
    if (!f.noAdvance) p.advance = advance();
    return p;
  }
  // Sections unlock in order: a section opens once every section before it is valid
  const ready = {
    phone: () => /^\d{10}$/.test(F.cleanPhone(f.phone)) && !!f.name.trim(),
    type: () => (isEvent() ? !!f.ev : !!f.pkg),
    dates: () => !!(f.checkIn && f.checkOut),
    guests: () => f.guests > 0,
    food: () => true,
    price: () => (finalTotal() || 0) > 0 && !f.quoteErr,
    advance: () => advOk(),
    hold: () => true,
    note: () => !f.noAdvance || !!f.note.trim()
  };
  const ORDER = Object.keys(ready);
  const unlocked = (sec) => ORDER.slice(0, ORDER.indexOf(sec)).every((s) => ready[s]());
  const allReady = () => ORDER.every((s) => ready[s]());

  function fetchQuote() {
    clearTimeout(quoteTimer);
    if (!ready.type() || !ready.dates() || !ready.guests()) { f.quote = null; f.quoteErr = ''; return paint(); }
    quoteTimer = setTimeout(async () => {
      const r = await api.staffQuote(payload());
      if (r.code === 'AUTH') return; // the nsg:staff-auth listener shows the PIN screen and returns here
      f.quote = r.ok ? r.data : null;
      f.quoteErr = r.ok || r.code === 'SPECIAL_TOTAL_REQUIRED' ? '' : (r.detail || r.error);
      paint();
    }, 350);
  }
  async function lookup() {
    const r = await api.staffLookupPhone(f.phone);
    if (r.code === 'AUTH') return;
    f.lookup = r.ok ? r.data : null;
    if (f.lookup && f.lookup.found && !f.name.trim()) { f.name = f.lookup.name; const n = $('f-name'); if (n) n.value = f.name; }
    paint();
  }

  // ---- the form ----
  async function view() {
    if (st.fresh) { f = S.form = blank(); st.fresh = false; }
    app().innerHTML = S.loading(t.home.loading);
    await ensureData();
    if (st.editFrom || st.copyFrom) {
      const src = st.editFrom || st.copyFrom;
      const edit = !!st.editFrom;
      st.editFrom = st.copyFrom = null;
      const r = await S.call(() => api.staffBooking(src.bookingId), () => S.go('home'));
      if (!r.ok) return r.code === 'AUTH' ? null : S.go('home');
      const b = r.data.booking;
      f = S.form = Object.assign(blank(), {
        phone: b.phone, name: b.name, type: b.bookingType, pkg: b.package || '', ev: b.eventType || '', checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests,
        addons: Object.fromEntries((b.addons || []).map((a) => [a.id, a.qty])), special: !!b.isSpecialPrice, specialTotal: b.isSpecialPrice ? String(b.total) : '',
        advance: String(b.advance), advanceLocked: edit && b.status !== 'HOLD', note: b.staffNote || '', editId: edit ? b.bookingId : ''
      });
    }
    draw();
    fetchQuote();
  }
  const sec = (id, title, inner) => `<section class="sf-sec" data-sec="${id}"><h3>${esc(title)}</h3>${inner}</section>`;
  function draw() {
    const edit = !!f.editId;
    app().innerHTML = `<div class="sf-form">
      <div class="sf-head"><button type="button" class="sf-back" data-go="home">${icon('i-back', 20)}${esc(t.nav.home)}</button><h2>${esc(edit ? t.form.editTitle : t.form.title)}</h2></div>
      ${sec('phone', t.form.phone, `<input class="form-input" id="f-phone" inputmode="numeric" autocomplete="off" value="${esc(f.phone)}"${edit ? ' readonly' : ''} placeholder="${esc(t.form.phoneHint)}"><p class="sf-lookup" id="f-lookup"></p><label class="form-label" for="f-name">${esc(t.form.name)}</label><input class="form-input" id="f-name" value="${esc(f.name)}">`)}
      ${sec('type', t.form.type, `<div class="sf-toggle" role="group">${['stay', 'event'].map((k) => `<button type="button" class="sf-tbtn${f.type === k ? ' is-on' : ''}" data-type="${k}"${edit ? ' disabled' : ''}>${icon(k === 'stay' ? 'i-home' : 'i-star', 18)}${esc(t.form[k])}</button>`).join('')}</div><div id="f-choice"></div>`)}
      ${sec('dates', isEvent() ? t.form.eventDate : t.form.dates, `<p class="sf-hint">${esc(t.form.datesHint)}</p><div class="staff-cal" id="f-cal"></div>${S.legend()}<p class="sf-picked" id="f-dates"></p>`)}
      ${sec('guests', t.form.guests, `<div class="chip-group" id="f-quick"></div><div class="sf-stepper"><button type="button" class="sf-step" data-g="-1" aria-label="−">−</button><input class="form-input" id="f-guests" inputmode="numeric" value="${f.guests || ''}"><button type="button" class="sf-step" data-g="1" aria-label="+">+</button><span class="sf-hint" id="f-gmax"></span></div>`)}
      ${sec('food', t.form.food, `<div class="sf-foods" id="f-foods"></div>`)}
      ${sec('price', t.form.price, `<p class="sf-std" id="f-std"></p>${isEvent() ? `<p class="sf-hint">${esc(t.form.eventSpecialHint)}</p>` : `<label class="sf-switch"><input type="checkbox" id="f-special"${f.special ? ' checked' : ''}><span>${esc(t.form.specialToggle)}</span></label>`}<div id="f-special-box"${isEvent() || f.special ? '' : ' hidden'}><label class="form-label" for="f-stotal">${esc(t.form.specialField)}</label><input class="form-input sf-amt" id="f-stotal" inputmode="numeric" value="${esc(f.specialTotal)}"><span class="st st--special" id="f-diff" hidden></span></div>`)}
      ${sec('advance', t.form.advance, `<div class="chip-group" id="f-achips"></div><label class="form-label" for="f-adv">${esc(t.form.custom)}</label><input class="form-input sf-amt" id="f-adv" inputmode="numeric" value="${esc(f.advance)}"${f.advanceLocked ? ' readonly' : ''}><p class="sf-hint sf-err" id="f-ahint"></p><div id="f-abar"></div>${edit ? '' : `<label class="sf-switch"><input type="checkbox" id="f-noadv"${f.noAdvance ? ' checked' : ''}><span>${esc(t.form.noAdvance)}</span></label>`}`)}
      ${edit ? '' : sec('hold', t.form.hold, `<div class="chip-group" id="f-hold">${HOLD.map((h) => `<button type="button" class="chip${f.hold === h ? ' is-active' : ''}" data-h="${h}" aria-pressed="${f.hold === h}">${esc(fill(t.form.hours, { n: h }))}</button>`).join('')}</div>`)}
      ${sec('note', f.noAdvance ? t.form.noAdvanceNote : t.form.note, `<textarea class="form-textarea" id="f-note" rows="2" placeholder="${esc(t.form.noteHint)}">${esc(f.note)}</textarea>`)}
    </div>
    <div class="sf-sticky"><div class="sf-money"><div><small>${esc(t.form.total)}</small><strong id="f-total">—</strong></div><div><small>${esc(t.form.advance)}</small><strong id="f-adv-out">—</strong></div><div><small>${esc(t.form.balance)}</small><strong id="f-bal">—</strong></div></div><button type="button" class="btn btn-primary btn-lg" id="f-check" disabled>${esc(t.form.check)}${icon('i-next', 18)}</button></div>`;
    S.bindGo();
    bind();
    drawChoice();
    drawCal();
    drawQuick();
    drawFoods();
    paint();
  }
  function bind() {
    const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
    on('f-phone', 'input', (e) => {
      f.phone = e.target.value; f.lookup = null;
      clearTimeout(lookupTimer);
      if (/^\d{10}$/.test(F.cleanPhone(f.phone))) lookupTimer = setTimeout(lookup, 300);
      paint();
    });
    on('f-name', 'input', (e) => { f.name = e.target.value; paint(); });
    app().querySelectorAll('.sf-tbtn').forEach((b) => b.addEventListener('click', () => {
      f.type = b.getAttribute('data-type'); f.checkIn = f.checkOut = ''; f.quote = null; f.special = false; f.specialTotal = '';
      draw(); fetchQuote();
    }));
    on('f-guests', 'change', (e) => setGuests(e.target.value));
    app().querySelectorAll('.sf-step[data-g]').forEach((b) => b.addEventListener('click', () => setGuests((f.guests || 0) + Number(b.getAttribute('data-g')))));
    on('f-special', 'change', (e) => { f.special = e.target.checked; $('f-special-box').hidden = !f.special; if (!f.special) { f.specialTotal = ''; $('f-stotal').value = ''; } paint(); });
    on('f-stotal', 'input', (e) => { f.specialTotal = e.target.value.replace(/\D/g, ''); paint(); });
    on('f-adv', 'input', (e) => { f.advance = e.target.value.replace(/\D/g, ''); paint(); });
    on('f-noadv', 'change', (e) => { f.noAdvance = e.target.checked; paint(); });
    on('f-note', 'input', (e) => { f.note = e.target.value; paint(); });
    app().querySelectorAll('#f-hold .chip').forEach((c) => c.addEventListener('click', () => {
      f.hold = Number(c.getAttribute('data-h'));
      app().querySelectorAll('#f-hold .chip').forEach((x) => { const on2 = x === c; x.classList.toggle('is-active', on2); x.setAttribute('aria-pressed', on2); });
    }));
    on('f-check', 'click', () => S.go('check'));
  }
  function setGuests(v) {
    f.guests = Math.max(0, Math.min(maxGuests(), Math.round(Number(v)) || 0));
    const g = $('f-guests');
    if (g) g.value = f.guests || '';
    drawQuick();
    fetchQuote();
  }
  function drawChoice() {
    const box = $('f-choice');
    box.innerHTML = isEvent()
      ? `<div class="chip-group">${info.eventTypes.map((e) => `<button type="button" class="chip${f.ev === e.id ? ' is-active' : ''}" data-ev="${esc(e.id)}" aria-pressed="${f.ev === e.id}">${esc(t.eventNames[e.id] || e.name)}</button>`).join('')}</div>`
      : `<div class="sf-pkgs">${info.packages.map((p) => `<button type="button" class="sf-pkg${f.pkg === p.id ? ' is-on' : ''}" data-pkg="${esc(p.id)}" aria-pressed="${f.pkg === p.id}">${icon('i-home', 18)}<strong>${esc(p.name)}</strong><span>${esc(fill(t.form.guestsMax, { max: p.maxGuests }))} · ${esc(t.form.advance)} ${inr(p.advance)}</span></button>`).join('')}</div>`;
    box.querySelectorAll('[data-ev],[data-pkg]').forEach((b) => b.addEventListener('click', () => {
      if (isEvent()) f.ev = b.getAttribute('data-ev'); else f.pkg = b.getAttribute('data-pkg');
      drawChoice();
      setGuests(f.guests);
    }));
  }
  function drawCal() {
    // in edit mode the booking's own nights stay selectable
    const own = new Set();
    if (f.editId && f.checkIn && f.checkOut) for (let d = f.checkIn; d < f.checkOut; d = F.addDays(d, 1)) own.add(d);
    const blocked = (st.data ? st.data.days : []).filter((d) => d.state !== 'free' && !own.has(d.date)).map((d) => d.date);
    new window.NSG.Calendar($('f-cal'), {
      mode: isEvent() ? 'single' : 'range', legend: false, months: 1, blockedDates: blocked, checkIn: f.checkIn || null, checkOut: f.checkOut || null,
      dayClass: (d) => 'sf-cal-' + (own.has(d) ? 'free' : S.dayState(d)),
      onBlockedClick: (d) => S.toast(S.holder(d) || `${F.dayLabel(d)}: ${t.status.free}`),
      onError: (m) => { if (m) S.toast(m); },
      onSelect: (r) => { f.checkIn = r.checkIn; f.checkOut = r.checkOut; fetchQuote(); }
    });
  }
  function drawQuick() {
    const box = $('f-quick');
    box.innerHTML = QUICK.filter((n) => n <= maxGuests()).map((n) => `<button type="button" class="chip${f.guests === n ? ' is-active' : ''}" data-q="${n}" aria-pressed="${f.guests === n}">${n}</button>`).join('');
    box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => setGuests(c.getAttribute('data-q'))));
    $('f-gmax').textContent = fill(t.form.guestsMax, { max: maxGuests() });
  }
  function drawFoods() {
    const box = $('f-foods');
    if (!foods.length) { box.innerHTML = `<p class="sf-hint">${esc(t.form.noFood)}</p>`; return; }
    box.innerHTML = foods.map((a) => {
      const q = f.addons[a.id];
      const min = a.minQty || 1;
      return `<div class="sf-food${q ? ' is-on' : ''}" data-id="${esc(a.id)}"><div><strong>${esc(a.name)}</strong><span>${inr(a.price)} · ${esc(fill(t.form.min, { min: min }))}</span>${q ? `<em>${q} × ${inr(a.price)} = ${inr(q * a.price)}</em>` : ''}</div>
        ${q ? `<div class="sf-stepper"><button type="button" class="sf-step" data-d="-1" aria-label="−">−</button><input class="form-input" inputmode="numeric" value="${q}" aria-label="${esc(a.name)}"><button type="button" class="sf-step" data-d="1" aria-label="+">+</button></div>` : `<button type="button" class="btn btn-secondary btn-sm">${esc(t.form.add)}</button>`}</div>`;
    }).join('');
    box.querySelectorAll('.sf-food').forEach((card) => {
      const a = foods.find((x) => x.id === card.getAttribute('data-id'));
      const min = a.minQty || 1, max = a.maxQty || 100;
      const set = (v) => { v = Math.round(Number(v)); if (!v || v < min) delete f.addons[a.id]; else f.addons[a.id] = Math.min(max, v); drawFoods(); fetchQuote(); };
      const btn = card.querySelector('.btn');
      if (btn) btn.addEventListener('click', () => set(min));
      card.querySelectorAll('.sf-step').forEach((s) => s.addEventListener('click', () => set((f.addons[a.id] || 0) + Number(s.getAttribute('data-d')))));
      const inp = card.querySelector('input');
      if (inp) inp.addEventListener('change', (e) => set(e.target.value));
    });
  }
  function drawAdvChips() {
    const tot = finalTotal() || 0;
    const opts = [[defAdv(), fill(t.form.defaultChip, { amount: inr(defAdv()) })], [2000, inr(2000)], [5000, inr(5000)], [10000, inr(10000)], [Math.round(tot * 0.25), '25%'], [Math.round(tot * 0.5), '50%']].filter((o) => o[0] > 0);
    const box = $('f-achips');
    box.innerHTML = opts.map((o) => { const on = !f.noAdvance && advance() === o[0]; return `<button type="button" class="chip${on ? ' is-active' : ''}" data-a="${o[0]}" aria-pressed="${on}"${f.noAdvance || f.advanceLocked ? ' disabled' : ''}>${esc(o[1])}</button>`; }).join('');
    box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { f.advance = c.getAttribute('data-a'); $('f-adv').value = f.advance; paint(); }));
  }
  /** Updates locks, hints and amounts without re-rendering the inputs (keeps focus while typing) */
  function paint() {
    if (st.view !== 'new' || !$('f-check')) return; // a late quote/lookup reply after leaving the form
    ORDER.forEach((s) => { const el = app().querySelector(`[data-sec="${s}"]`); if (el) el.classList.toggle('is-locked', !unlocked(s)); });
    const lk = $('f-lookup');
    if (lk) lk.innerHTML = !f.lookup ? '' : f.lookup.found ? `<span class="st st--confirmed">${icon('i-people', 12)}${esc(fill(t.form.lookup, { name: f.lookup.name, visits: f.lookup.visits }))}</span>` : `<span class="st st--closed">${esc(t.form.newGuest)}</span>`;
    const dt = $('f-dates');
    if (dt) dt.textContent = f.checkIn && f.checkOut ? `${F.dayLabel(f.checkIn)} – ${F.dayLabel(f.checkOut)} · ${nightsText(F.nights(f.checkIn, f.checkOut))}` : '';
    const std = $('f-std');
    if (std) std.innerHTML = f.quoteErr ? `<span class="sf-err">${esc(f.quoteErr)}</span>` : isEvent() ? esc(t.form.eventTotalRequired) : standard() !== null ? esc(fill(t.form.standard, { amount: inr(standard()) })) : ready.dates() && ready.guests() ? '…' : '—';
    const diff = $('f-diff');
    if (diff) {
      const s = standard(), sp = Number(f.specialTotal);
      diff.hidden = !(s && sp > 0 && sp !== s);
      if (!diff.hidden) diff.innerHTML = icon('i-star', 12) + esc(fill(sp < s ? t.specialOff : t.specialUp, { amount: inr(Math.abs(s - sp)) }));
    }
    drawAdvChips();
    const tot = finalTotal();
    $('f-ahint').textContent = !f.noAdvance && tot && !advOk() ? fill(t.form.advanceRange, { min: inr(minAdv()), max: inr(tot) }) : '';
    $('f-abar').innerHTML = tot ? S.bar(advance(), tot) : '';
    $('f-adv').disabled = f.noAdvance;
    const noteH = app().querySelector('[data-sec="note"] h3');
    if (noteH) noteH.textContent = f.noAdvance ? t.form.noAdvanceNote : t.form.note;
    $('f-total').textContent = tot ? inr(tot) : '—';
    $('f-adv-out').textContent = tot ? inr(advance()) : '—';
    $('f-bal').textContent = tot ? inr(balance()) : '—';
    $('f-check').disabled = !allReady();
  }

  // ---- check screen: server quote + warnings, then create / save ----
  async function check() {
    app().innerHTML = S.loading(t.home.loading);
    const r = await S.call(() => api.staffQuote(payload()), () => S.go('new'));
    if (!r.ok) return r.code === 'AUTH' ? null : S.go('new');
    const q = r.data;
    const edit = !!f.editId;
    if (!f.requestId) f.requestId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const adv = f.noAdvance ? 0 : q.advance, tot = q.finalTotal;
    const kv = (ic, html) => `<p class="sf-kv">${icon(ic, 16)}<span>${html}</span></p>`;
    app().innerHTML = `<div class="sf-check">
      <div class="sf-head"><button type="button" class="sf-back" id="c-back">${icon('i-back', 20)}${esc(t.nav.back)}</button><h2>${esc(t.check.title)}</h2></div>
      <section class="pay-card">
        <h3>${esc(f.name.trim())}</h3>
        ${kv('i-phone', esc(F.cleanPhone(f.phone)) + (f.lookup && f.lookup.found ? ` · ${esc(fill(t.form.lookup, { name: f.lookup.name, visits: f.lookup.visits }))}` : ''))}
        ${kv('i-home', esc(label()))}
        ${kv('i-calendar', `${esc(F.dayLabel(q.checkIn))} – ${esc(F.dayLabel(q.checkOut))} · ${esc(nightsText(q.nights))}`)}
        ${kv('i-people', esc(fill(t.form.guestsN, { n: q.guests })))}
        ${q.addonsBreakdown.length ? `<div class="pay-chips">${q.addonsBreakdown.map((a) => `<span class="chip">${esc(a.name)} × ${a.qty} = ${inr(a.lineTotal)}</span>`).join('')}</div>` : ''}
        <div class="sf-money"><div><small>${esc(t.form.total)}</small><strong>${inr(tot)}</strong>${q.isSpecialPrice ? `<span class="st st--special">${icon('i-star', 12)}${esc(t.special)}</span>` : ''}</div><div><small>${esc(t.form.advance)}</small><strong>${inr(adv)}</strong></div><div><small>${esc(t.form.balance)}</small><strong>${inr(tot - adv)}</strong></div></div>${S.bar(adv, tot)}
        ${f.noAdvance ? kv('i-check', esc(t.check.noAdvanceLabel)) : edit ? '' : kv('i-clock', esc(fill(t.check.holdFor, { n: f.hold })))}
        ${f.note.trim() ? kv('i-edit', esc(f.note.trim())) : ''}
        ${q.warnings.length ? `<ul class="sf-warn">${q.warnings.map((w) => `<li>${icon('i-clock', 14)}${esc(w)}</li>`).join('')}</ul>` : ''}
      </section>
      <div class="sf-row2"><button type="button" class="btn btn-secondary btn-lg" id="c-back2">${esc(t.nav.back)}</button><button type="button" class="btn btn-primary btn-lg" id="c-create">${esc(edit ? t.check.saveChanges : t.check.create)}</button></div></div>`;
    ['c-back', 'c-back2'].forEach((id) => $(id).addEventListener('click', () => S.go('new')));
    $('c-create').addEventListener('click', create);
  }
  async function create() {
    const btn = $('c-create');
    const edit = !!f.editId;
    if (f.noAdvance && !edit && !(await S.confirm(fill(t.check.confirmWalkin, { name: f.name.trim() })))) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="sf-spin"></span>${esc(edit ? t.check.saving : t.check.creating)}`;
    const p = payload();
    const r = await S.call(() => (edit
      ? api.staffUpdateLink(f.editId, { name: f.name.trim(), guests: p.guests, checkIn: p.checkIn, checkOut: p.checkOut, package: p.package, eventType: p.eventType, addons: p.addons, specialTotal: p.specialTotal === undefined ? '' : p.specialTotal, advance: f.advanceLocked ? undefined : p.advance, note: f.note })
      : api.staffCreateLink(Object.assign(p, { requestId: f.requestId, name: f.name.trim(), phone: f.phone, holdHours: f.hold, note: f.note, confirmWithoutAdvance: f.noAdvance || undefined }))), create);
    if (!r.ok) {
      if (st.view === 'check') { btn.disabled = false; btn.textContent = edit ? t.check.saveChanges : t.check.create; }
      return;
    }
    st.result = Object.assign({ edit: edit, name: f.name.trim() }, r.data);
    f = S.form = blank();
    S.refresh(true);
    S.go('result');
  }

  // ---- result screen ----
  function result() {
    const r = st.result;
    if (!r) return S.go('home');
    app().innerHTML = `<div class="sf-result">
      <span class="pay-state-icon sf-ok">${icon('i-check', 36)}</span>
      <h2>${esc(r.edit ? t.result.updated : t.result.title)}</h2>
      <p class="sf-kv"><span>${esc(fill(t.check.linkFor, { name: r.name }))} · ${inr(r.total)} · ${esc(t.form.advance)} ${inr(r.advance)} · ${esc(t.form.balance)} ${inr(r.balance)}</span></p>
      <p class="sf-muted">${esc(r.status === 'CONFIRMED' ? t.result.confirmedNow : fill(t.result.holdUntil, { time: S.when(r.holdExpiresAt) }))}</p>
      ${(r.warnings || []).length ? `<ul class="sf-warn">${r.warnings.map((w) => `<li>${icon('i-clock', 14)}${esc(w)}</li>`).join('')}</ul>` : ''}
      <a class="btn btn-primary btn-lg" href="${esc(r.waUrl)}" target="_blank" rel="noopener">${icon('i-wa')}${esc(t.result.send)}</a>
      <div class="sf-row2"><button type="button" class="btn btn-secondary btn-md" data-copy="payUrl">${icon('i-link', 18)}${esc(t.result.copyLink)}</button><button type="button" class="btn btn-secondary btn-md" data-copy="guestMessage">${icon('i-copy', 18)}${esc(t.result.copyMessage)}</button></div>
      <pre class="sf-msg">${esc(r.guestMessage)}</pre>
      <div class="sf-row2"><button type="button" class="btn btn-ghost btn-md" data-go="new">${esc(t.result.another)}</button><button type="button" class="btn btn-ghost btn-md" data-go="home">${esc(t.result.home)}</button></div></div>`;
    S.bindGo();
    app().querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(r[b.getAttribute('data-copy')] || '').then(() => S.toast(t.result.copied), () => {});
    }));
  }

  S.views.new = view;
  S.views.check = check;
  S.views.result = result;
})();
