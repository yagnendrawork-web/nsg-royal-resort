/* NSG ROYAL RESORT — pay.js: guest pay page (pay.html?t=TOKEN). Loads the booking with api.getByToken,
   shows one screen per status (HOLD pays by UPI and submits the UTR by token; PAYMENT_SUBMITTED polls;
   CONFIRMED saves/prints, adds to calendar; closed states point to WhatsApp). Text: site.json "pay". */
window.NSG = window.NSG || {};
(function () {
  'use strict';
  const app = document.getElementById('pay-app');
  if (!app || !window.NSG.api || !window.NSG.api.getByToken) return;
  let t = {};
  try { t = JSON.parse(document.getElementById('pay-text').textContent); } catch (e) {}
  const api = window.NSG.api;
  const F = api.fmt;
  const inr = F.inr;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const icon = (id, size) => `<svg width="${size || 20}" height="${size || 20}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('t') || '';
  const config = window.NSG.CONFIG || {};
  const wa = config.WHATSAPP && !String(config.WHATSAPP).startsWith('[TBD') ? 'https://wa.me/' + config.WHATSAPP : '';
  const waAttrs = wa ? ' target="_blank" rel="noopener noreferrer"' : '';
  const waLink = (msg) => (wa ? `${wa}?text=${encodeURIComponent(msg)}` : 'contact.html');
  const steps = Array.from(document.querySelectorAll('.pay-step'));
  const title = $('pay-title');
  const help = $('pay-help');
  let data = null;
  let timers = {};
  let pollStart = 0;
  let lastUpdate = 0;

  // ---- small helpers ----
  function setSteps(current, done) {
    steps.forEach((li, i) => { li.classList.toggle('is-done', i < done); li.classList.toggle('is-current', i === current); });
  }
  function clearTimers() { Object.keys(timers).forEach((k) => clearInterval(timers[k])); timers = {}; }
  const pkgName = (b) => b.packageName || t.eventNames[b.eventType] || t.eventNames.other;
  const nightsText = (n) => (n === 1 ? t.nightsOne : fill(t.nightsMany, { n: n }));
  /** "15:00" | "3 PM" | "11 AM" -> "15:00" (fallback when unreadable) */
  function hhmm(v, fb) {
    const s = String(v || '').trim();
    let m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(s);
    if (m) { let h = Number(m[1]) % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, '0')}:${m[2] || '00'}`; }
    return fb;
  }
  /** "15:00" -> "3:00 PM" */
  function hm(v) {
    const s = hhmm(v, '');
    if (!s) return String(v || '');
    const h = Number(s.slice(0, 2));
    return `${h % 12 || 12}:${s.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function copy(text, btn, label) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = icon('i-check', 16) + esc(t.copied);
      setTimeout(() => { btn.innerHTML = icon('i-copy', 16) + esc(label); }, 1800);
    }, () => {});
  }
  function showError(msg) {
    const el = $('pay-utr-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!msg);
  }

  // ---- shared blocks ----
  function summaryCard(b) {
    return `<section class="pay-card pay-summary">
      <div class="pay-row">${icon('i-home')}<div><strong>${esc(pkgName(b))}</strong>${b.isSpecialPrice ? `<span class="st st--special">${icon('i-star', 14)}${esc(t.specialTag)}</span>` : ''}</div></div>
      <div class="pay-row">${icon('i-calendar')}<div><strong>${esc(F.dayLabel(b.checkIn))} – ${esc(F.dayLabel(b.checkOut))}</strong><span>${esc(nightsText(b.nights))} · ${esc(t.checkIn)} ${esc(fill(t.fromTime, { time: hm(b.checkInTime) }))}, ${esc(t.checkOut)} ${esc(fill(t.untilTime, { time: hm(b.checkOutTime) }))}</span></div></div>
      <div class="pay-row">${icon('i-people')}<div><strong>${esc(fill(t.guests, { n: b.guests }))}</strong></div></div>
      ${b.addons.length ? `<div class="pay-chips">${b.addons.map((a) => `<span class="chip">${esc(a.name)} × ${a.qty}</span>`).join('')}</div>` : ''}
    </section>`;
  }
  function moneyBlock(b, big) {
    const ok = b.status === 'CONFIRMED';
    const adv = ok ? b.advancePaid : b.advance;
    const pct = b.total ? Math.min(100, Math.round(adv / b.total * 100)) : 0;
    return `<section class="pay-card pay-money">${big}
      <div class="pay-bar${ok ? ' pay-bar--ok' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <dl class="pay-money-rows"><div><dt>${esc(t.balanceAtResort)}</dt><dd>${inr(b.balance)}</dd></div><div><dt>${esc(t.total)}</dt><dd>${inr(b.total)}</dd></div></dl>
    </section>`;
  }
  // Rating strip + one guest review under the summary (reviews.js; renders nothing without reviews; not announced)
  // "Included free with your booking" row (template in pay.html; static markup)
  const includedRow = () => { const tpl = document.getElementById('svc-booking-tpl'); return tpl ? tpl.innerHTML : ''; };
  const reviewsSlot = (b) => `<div class="rv-paypage" data-reviews="strip card" data-topic="${b.bookingType === 'event' ? 'event' : 'stay'}" aria-live="off"></div>`;
  const bigLine = (label, amount, ok) => `<p class="pay-big${ok ? ' pay-big--ok' : ''}"><span>${esc(label)}</span>${amount === null ? '' : `<strong>${inr(amount)}</strong>`}</p>`;
  const utrPicture = `<svg viewBox="0 0 72 110" aria-hidden="true"><rect x="4" y="2" width="64" height="106" rx="8" fill="#fff" stroke="#1E2421" stroke-width="2"/><path d="M12 18h48M12 32h48M12 88h48" stroke="#F1EADB" stroke-width="8"/><rect x="9" y="52" width="54" height="20" rx="4" fill="none" stroke="#C29B4A" stroke-width="2"/><text x="36" y="65" font-size="7" text-anchor="middle" font-weight="700" fill="#1E2421">UTR 4123…</text></svg>`;

  // ---- HOLD: details, countdown, policy, UPI payment, UTR ----
  function renderHold(b, pay) {
    setSteps(0, 0);
    title.textContent = fill(t.greeting, { name: b.firstName });
    const phone = matchMedia('(max-width: 768px)').matches;
    app.innerHTML = `<p class="pay-intro">${esc(t.intro)}</p>${summaryCard(b)}${includedRow()}${reviewsSlot(b)}
      ${moneyBlock(b, bigLine(t.payNow, b.advance))}
      <div class="pay-ring" id="pay-ring"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="20" id="pay-ring-arc"/></svg><span id="pay-ring-text"></span></div>
      <label class="pay-policy"><input type="checkbox" id="pay-policy"><span>${esc(t.policyLabel)} <a href="policies.html#cancellation" target="_blank" rel="noopener">${esc(t.policyLink)}</a></span></label>
      <section class="pay-card pay-upi">
        ${phone && pay.upiLink
          ? `<a class="btn btn-primary btn-lg pay-upi-btn" href="${esc(pay.upiLink)}">${icon('i-upi')}${esc(fill(t.payBtn, { amount: inr(pay.amount || b.advance) }))}</a>`
          : `<div class="pay-qr" id="pay-qr"></div><p class="pay-qr-caption">${esc(t.scanPrompt)}</p>`}
        <div class="pay-upi-id"><span>${esc(t.upiIdLabel)}</span><code>${esc(pay.upiId)}</code><button type="button" class="btn btn-secondary btn-sm" id="pay-copy-upi">${icon('i-copy', 16)}${esc(t.copyUpi)}</button></div>
        <ol class="pay-mini">${(t.miniSteps || []).map((s, i) => `<li><span>${i + 1}</span>${esc(s)}</li>`).join('')}</ol>
        <form id="pay-utr-form" novalidate>
          <label class="form-label" for="pay-utr">${esc(t.utrLabel)}</label>
          <input class="form-input" id="pay-utr" inputmode="numeric" autocomplete="off" maxlength="22" placeholder="${esc(t.utrExample)}">
          <button type="button" class="pay-link-btn" id="pay-utr-help-toggle" aria-expanded="false">${esc(t.utrHelpToggle)}</button>
          <div class="pay-utr-help" id="pay-utr-help" hidden>${utrPicture}<p>${esc(t.utrHelp)}</p></div>
          <p class="form-error pay-error" id="pay-utr-error" role="alert"></p>
          <button type="submit" class="btn btn-primary btn-lg" id="pay-submit">${esc(t.submitUtr)}</button>
        </form>
      </section>`;
    if (!phone && pay.upiLink && window.NSG.Payment) {
      window.NSG.Payment.loadQr().then(() => { const q = $('pay-qr'); if (q) q.innerHTML = window.NSG.Payment.qrHtml(pay.upiLink); }, () => {});
    }
    $('pay-copy-upi').addEventListener('click', (e) => copy(pay.upiId || '', e.currentTarget, t.copyUpi));
    $('pay-utr-help-toggle').addEventListener('click', (e) => {
      const box = $('pay-utr-help');
      box.hidden = !box.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
    });
    $('pay-utr-form').addEventListener('submit', (e) => { e.preventDefault(); submitUtr(); });
    startCountdown(b.holdExpiresAt);
  }

  function startCountdown(expiresAt) {
    const end = new Date(expiresAt).getTime();
    const arc = $('pay-ring-arc');
    const text = $('pay-ring-text');
    const ring = $('pay-ring');
    const C = 125.66; // 2πr for r=20
    const update = () => {
      const left = end - Date.now();
      if (left <= 0) { clearInterval(timers.count); text.textContent = t.heldEnded; return load(true); }
      const h = Math.floor(left / 36e5);
      const m = Math.floor((left % 36e5) / 6e4);
      text.textContent = fill(t.heldFor, { time: h ? `${h}h ${m}m` : `${m}m` });
      ring.classList.toggle('is-ending', left < 36e5);
      arc.style.strokeDashoffset = String(C * (1 - Math.min(1, left / 864e5)));
    };
    update();
    timers.count = setInterval(update, 1000);
  }

  async function submitUtr() {
    const input = $('pay-utr');
    const btn = $('pay-submit');
    const utr = input.value.trim();
    if (!$('pay-policy').checked) return showError(t.policyRequired);
    if (!/^[A-Za-z0-9]{8,22}$/.test(utr)) { input.focus(); return showError(t.utrError); }
    showError('');
    btn.disabled = true;
    btn.textContent = t.submitting;
    const r = await api.submitPayment({ token: token }, utr);
    if (!r.ok) {
      btn.disabled = false;
      btn.textContent = t.submitUtr;
      return showError(r.detail || r.error);
    }
    load();
  }

  // ---- PAYMENT_SUBMITTED: hourglass + polling ----
  function renderPending(b) {
    setSteps(2, 2);
    title.textContent = fill(t.greeting, { name: b.firstName });
    app.innerHTML = `<section class="pay-card pay-state pay-state--pending">
        <span class="pay-state-icon pay-hourglass">${icon('i-hourglass', 36)}</span>
        <h2>${esc(t.checkingTitle)}</h2><p>${esc(t.checkingText)}</p>
        <p class="pay-updated" id="pay-updated">${esc(t.updatedJustNow)}</p>
        <button type="button" class="btn btn-secondary btn-md" id="pay-refresh">${icon('i-refresh', 18)}${esc(t.refresh)}</button>
      </section>${summaryCard(b)}${includedRow()}${reviewsSlot(b)}${moneyBlock(b, bigLine(t.advanceLabel, b.advance))}`;
    $('pay-refresh').addEventListener('click', () => load(true));
    if (!pollStart) pollStart = Date.now();
    // every 20 s for up to 15 min; skipped while the tab is hidden, resumed by visibilitychange below
    timers.poll = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - pollStart > 15 * 6e4) return clearInterval(timers.poll);
      load(true);
    }, 20000);
    timers.upd = setInterval(() => {
      const el = $('pay-updated');
      const s = Math.round((Date.now() - lastUpdate) / 1000);
      if (el) el.textContent = s < 5 ? t.updatedJustNow : fill(t.updatedAgo, { n: s });
    }, 5000);
  }

  // ---- CONFIRMED: receipt (print.css), calendar, directions, what to bring ----
  function renderConfirmed(b) {
    setSteps(3, 3);
    title.textContent = fill(t.greeting, { name: b.firstName });
    const paid = b.advancePaid > 0;
    app.innerHTML = `<section class="pay-card pay-state pay-state--ok no-print">
        <span class="pay-state-icon">${icon('i-check', 36)}</span>
        <h2>${esc(t.confirmedTitle)}</h2>
        <p class="pay-id">${esc(t.bookingId)}: <strong>${esc(b.bookingId)}</strong><button type="button" class="btn btn-ghost btn-sm" id="pay-copy-id">${icon('i-copy', 16)}${esc(t.copyId)}</button></p>
      </section>
      <div class="booking-receipt-card pay-receipt" id="booking-receipt">
        <div class="receipt-header pay-print-only"><div><span class="receipt-subtitle">NSG Royal Resort</span><h2 class="receipt-title">${esc(t.confirmationTitle)}</h2><div class="receipt-id">${esc(t.bookingId)}: <strong>${esc(b.bookingId)}</strong></div></div></div>
        ${summaryCard(b)}
        ${moneyBlock(b, paid ? bigLine(t.advanceReceived, b.advancePaid, true) : bigLine(t.noAdvance, null, true))}
        <div class="receipt-property-info pay-print-only"><strong>NSG Royal Resort</strong> · ${esc(app.dataset.address)}</div>
      </div>
      <div class="pay-actions no-print">
        <button type="button" class="btn btn-primary btn-md" id="pay-print">${icon('i-download', 18)}${esc(t.saveBtn)}</button>
        <button type="button" class="btn btn-secondary btn-md" id="pay-ics">${icon('i-calendar', 18)}${esc(t.calendarBtn)}</button>
        <a class="btn btn-secondary btn-md" href="${esc(app.dataset.directions)}" target="_blank" rel="noopener noreferrer">${icon('i-pin', 18)}${esc(t.directionsBtn)}</a>
      </div>
      <section class="pay-card no-print"><h3>${esc(t.bringTitle)}</h3><ul class="pay-bring">${(t.bring || []).map((s) => `<li>${icon('i-check', 16)}${esc(s)}</li>`).join('')}</ul></section>`;
    $('pay-copy-id').addEventListener('click', (e) => copy(b.bookingId, e.currentTarget, t.copyId));
    $('pay-print').addEventListener('click', () => window.print());
    $('pay-ics').addEventListener('click', () => downloadIcs(b));
  }

  function downloadIcs(b) {
    const stamp = (d, time) => d.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
    const text = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NSG Royal Resort//Booking//EN', 'BEGIN:VEVENT',
      `UID:${b.bookingId}@nsgroyalresort`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Asia/Kolkata:${stamp(b.checkIn, hhmm(b.checkInTime, '11:00'))}`, `DTEND;TZID=Asia/Kolkata:${stamp(b.checkOut, hhmm(b.checkOutTime, '10:00'))}`,
      `SUMMARY:${text(fill(t.icsTitle, { package: pkgName(b) }))}`, `LOCATION:${text(app.dataset.address)}`, `DESCRIPTION:${text(t.bookingId + ' ' + b.bookingId)}`,
      'END:VEVENT', 'END:VCALENDAR'];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = `nsg-booking-${b.bookingId}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---- EXPIRED / REJECTED / CANCELLED / NOT_FOUND ----
  function renderClosed(code, b) {
    setSteps(-1, 0);
    title.textContent = t.title;
    const id = b ? b.bookingId : token;
    app.innerHTML = `<section class="pay-card pay-state pay-state--closed">
        <span class="pay-state-icon">${icon('i-cross', 36)}</span>
        <p>${esc(t.closed[code] || t.closed.NOT_FOUND)}</p>
        <a class="btn btn-primary btn-lg" href="${waLink(fill(t.closedMessage, { id: id }))}"${waAttrs}>${icon('i-wa')}${esc(t.whatsappUs)}</a>
      </section>${b ? summaryCard(b) : ''}`;
  }

  // ---- load and route by status ----
  async function load(quiet) {
    if (!token) return renderClosed('NOT_FOUND');
    if (!quiet) app.innerHTML = `<div class="pay-loading nsg-loading" role="status">${window.NSG.loader ? window.NSG.loader() : ''}<p>${esc(t.loading)}</p></div>`;
    const r = await api.getByToken(token);
    if (!r.ok) {
      if (r.code === 'NOT_FOUND') { clearTimers(); return renderClosed('NOT_FOUND'); }
      if (quiet) return;
      app.innerHTML = `<section class="pay-card pay-state"><p>${esc(t.loadError)}</p><button type="button" class="btn btn-secondary btn-md" id="pay-retry">${esc(t.retry)}</button></section>`;
      return $('pay-retry').addEventListener('click', () => load());
    }
    lastUpdate = Date.now();
    const b = r.data.booking;
    const same = data && data.booking.status === b.status;
    data = r.data;
    help.hidden = false;
    help.href = waLink(fill(t.helpMessage, { id: b.bookingId }));
    if (wa) help.target = '_blank';
    if (quiet && same) return; // polling: nothing changed, keep the current screen
    clearTimers();
    if (b.status === 'HOLD') renderHold(b, r.data.payment || {});
    else if (b.status === 'PAYMENT_SUBMITTED') renderPending(b);
    else if (b.status === 'CONFIRMED') renderConfirmed(b);
    else renderClosed(b.status, b);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && data && data.booking.status === 'PAYMENT_SUBMITTED') load(true);
  });
  load();
})();
