/* NSG ROYAL RESORT — api.link.js: pay-link and staff actions (docs/api.md: "Guest pay page", "Staff app").
   Loaded only by pay.html and staff.html; extends window.NSG.api from api.js.
   Rules: every call resolves (never throws) with { ok, data } or { ok:false, code, error, detail, ...extras };
   the staff token travels in the JSON body only; on AUTH the token is dropped and the window event
   'nsg:staff-auth' fires so the staff app can return to its PIN screen.
   Mock mode (CONFIG.USE_MOCK): PIN 246810 logs in as "Demo Staff"; token "DEMO" opens a HOLD on pay.html. */
window.NSG = window.NSG || {};
(function () {
  'use strict';

  const api = window.NSG.api = window.NSG.api || {};
  const M = api._mock || {};
  /* MOCK:START */
  // ?mock=1 on pay.html / staff.html switches to mock data for this page view only (config.json untouched)
  const MOCK_PARAM = typeof location !== 'undefined' && /[?&]mock=1\b/.test(location.search);
  if (MOCK_PARAM && window.NSG.CONFIG) window.NSG.CONFIG.USE_MOCK = true;
  /* MOCK:END */
  const TOKEN_KEY = 'nsg_staff_token';
  const TIMEOUT_MS = 15000; // Apps Script cold starts are slow; same reason getInfo/addons use 15 s
  const cfg = () => window.NSG.CONFIG || { USE_MOCK: true, API_URL: '' };
  const errText = (code) => {
    const e = (window.NSG.UI && window.NSG.UI.errors) || {};
    return e[code] || e.GENERIC_ERROR || 'Something went wrong. Please try again.';
  };
  const fail = (code, extra) => Object.assign({ ok: false, code: code, error: errText(code), detail: '' }, extra || {});
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };

  // ---- Date helpers: YYYY-MM-DD strings only (never new Date("YYYY-MM-DD") for display) ----
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  function utc(s) { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  /** "2027-01-09" -> "Sat 9 Jan" */
  function dayLabel(s) {
    if (!isDateStr(s)) return '';
    const d = new Date(utc(s));
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONS[d.getUTCMonth()]}`;
  }
  const nightsBetween = (a, b) => Math.max(0, Math.round((utc(b) - utc(a)) / 864e5));
  function eachNight(a, b) {
    const out = [];
    for (let i = 0, n = nightsBetween(a, b); i < n; i++) out.push(M.addDays(a, i));
    return out;
  }
  function cleanPhone(v) {
    let p = String(v || '').replace(/\D/g, '');
    if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
    if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
    return p;
  }

  // ---- Staff token (localStorage; sent in the body only) ----
  let staffToken = ls.get(TOKEN_KEY) || '';
  function setStaffToken(t) { staffToken = t || ''; ls.set(TOKEN_KEY, staffToken || null); }
  function authLost(code) {
    setStaffToken('');
    try { window.dispatchEvent(new CustomEvent('nsg:staff-auth', { detail: { code: code } })); } catch (e) {}
  }

  // ---- Live transport ----
  async function request(url, init) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), TIMEOUT_MS);
    let json;
    try {
      const res = await fetch(url, Object.assign({ signal: c.signal }, init || {}));
      json = await res.json();
    } catch (e) {
      return fail('NETWORK');
    } finally {
      clearTimeout(id);
    }
    if (!json || typeof json !== 'object') return fail('NETWORK');
    if (!json.ok) {
      const code = json.code || 'GENERIC_ERROR';
      if (code === 'AUTH') authLost(code);
      return Object.assign({}, json, { ok: false, code: code, error: errText(code), detail: json.error || '' });
    }
    const data = Object.assign({}, json);
    delete data.ok;
    return { ok: true, data: data };
  }
  const post = (body) => request(cfg().API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });

  function staffCall(action, payload) {
    /* MOCK:START */
    if (cfg().USE_MOCK) return Promise.resolve().then(() => mockStaff(action, payload || {}));
    /* MOCK:END */
    if (action !== 'staffLogin' && !staffToken) { authLost('AUTH'); return Promise.resolve(fail('AUTH')); }
    const body = Object.assign({ action: action }, payload || {});
    if (action !== 'staffLogin') body.staffToken = staffToken;
    return post(body);
  }

  // Numbers from the Sheet may arrive as strings
  function normBooking(b) {
    b = Object.assign({}, b || {});
    ['total', 'advance', 'advancePaid', 'balance', 'balancePaid', 'remaining', 'guests', 'nights', 'addonsTotal', 'baseTotal'].forEach((k) => {
      if (b[k] !== undefined && b[k] !== null && b[k] !== '') b[k] = num(b[k]);
    });
    b.isSpecialPrice = b.isSpecialPrice === true || String(b.isSpecialPrice).toLowerCase() === 'true';
    b.addons = Array.isArray(b.addons) ? b.addons : [];
    return b;
  }

  // -------------------------------------------------------------------------
  // Public: GET getByToken&t=
  // -------------------------------------------------------------------------
  async function getByToken(token) {
    const t = String(token || '').trim();
    if (!t) return fail('NOT_FOUND');
    /* MOCK:START */
    if (cfg().USE_MOCK) return mockGetByToken(t);
    /* MOCK:END */
    const r = await request(`${cfg().API_URL}?action=getByToken&t=${encodeURIComponent(t)}`);
    if (!r.ok) return r;
    return { ok: true, data: { booking: normBooking(r.data.booking), payment: r.data.payment || null } };
  }

  // -------------------------------------------------------------------------
  // Staff actions (all POST with staffToken in the body)
  // -------------------------------------------------------------------------
  async function staffLogin(pin, deviceId) {
    const r = await staffCall('staffLogin', { pin: String(pin || ''), deviceId: String(deviceId || '') });
    if (r.ok) setStaffToken(r.data.token);
    else if (r.code === 'LOCKED') r.lockedMinutes = num(r.minutes || r.retryAfterMinutes) || 15;
    return r;
  }
  async function staffLogout() {
    const r = await staffCall('staffLogout', {});
    setStaffToken('');
    return r;
  }
  const staffMe = () => staffCall('staffMe', {});
  const staffLookupPhone = (phone) => staffCall('staffLookupPhone', { phone: cleanPhone(phone) });
  const staffQuote = (q) => staffCall('staffQuote', q);
  const staffCreateLink = (p) => staffCall('staffCreateLink', Object.assign({}, p, { phone: cleanPhone(p && p.phone) }));
  const staffUpdateLink = (bookingId, fields) => staffCall('staffUpdateLink', { bookingId: bookingId, fields: fields || {} });
  const staffExtendHold = (bookingId, hours) => staffCall('staffExtendHold', { bookingId: bookingId, hours: num(hours) });
  const staffConfirm = (bookingId, amountReceived) => staffCall('staffConfirm', amountReceived === undefined || amountReceived === '' ? { bookingId: bookingId } : { bookingId: bookingId, amountReceived: num(amountReceived) });
  const staffReject = (bookingId) => staffCall('staffReject', { bookingId: bookingId });
  const staffCollectBalance = (bookingId, amount, method) => staffCall('staffCollectBalance', { bookingId: bookingId, amount: num(amount), method: String(method || 'cash') });
  const staffCancel = (bookingId, reason) => staffCall('staffCancel', { bookingId: bookingId, reason: String(reason || '') });
  const staffBlock = (dates, note) => staffCall('staffBlock', { dates: dates || [], note: String(note || '') });
  const staffUnblock = (dates) => staffCall('staffUnblock', { dates: dates || [] });
  async function staffList(from, to) {
    const r = await staffCall('staffList', { from: from, to: to });
    if (r.ok) { r.data.bookings = (r.data.bookings || []).map(normBooking); r.data.blocks = r.data.blocks || []; }
    return r;
  }
  async function staffCalendar(from, to) {
    const r = await staffCall('staffCalendar', { from: from, to: to });
    if (r.ok) r.data.days = r.data.days || [];
    return r;
  }
  async function staffBooking(bookingId) {
    const r = await staffCall('staffBooking', { bookingId: bookingId });
    if (r.ok) r.data.booking = normBooking(r.data.booking);
    return r;
  }
  const staffResendMessage = (bookingId) => staffCall('staffResendMessage', { bookingId: bookingId });
  const staffReviewMessage = (bookingId) => staffCall('staffReviewMessage', { bookingId: bookingId });

  Object.assign(api, {
    getByToken: getByToken,
    setStaffToken: setStaffToken,
    getStaffToken: () => staffToken,
    staffLogin: staffLogin, staffMe: staffMe, staffLogout: staffLogout, staffLookupPhone: staffLookupPhone,
    staffQuote: staffQuote, staffCreateLink: staffCreateLink, staffUpdateLink: staffUpdateLink,
    staffExtendHold: staffExtendHold, staffConfirm: staffConfirm, staffReject: staffReject,
    staffCollectBalance: staffCollectBalance, staffCancel: staffCancel, staffBlock: staffBlock, staffUnblock: staffUnblock,
    staffList: staffList, staffCalendar: staffCalendar, staffBooking: staffBooking, staffResendMessage: staffResendMessage,
    staffReviewMessage: staffReviewMessage,
    // display helpers shared by pay.js and staff.js
    fmt: { dayLabel: dayLabel, inr: inr, nights: nightsBetween, cleanPhone: cleanPhone, today: () => M.today(), addDays: (d, n) => M.addDays(d, n) }
  });

  /* MOCK:START */
  // =========================================================================
  // MOCK MODE (mirrors the server rules in docs/api.md; data in localStorage nsg_mock_*)
  // =========================================================================
  const DEMO_PIN = '246810';
  const DEMO_NAME = 'Demo Staff';
  const MIN_ADV = 1000;
  const ACTIVE = ['HOLD', 'PAYMENT_SUBMITTED', 'CONFIRMED'];
  const SESSION_KEY = 'nsg_mock_staff';
  const PINFAIL_KEY = 'nsg_mock_pinfail';
  const TEMPLATE = 'Hi {name}! Your {package} at NSG Royal Resort is ready.\n{dates} · {guests} guests\nTotal ₹{total}\nPay advance ₹{advance} here: {link}\nBalance ₹{balance} at the resort.\nDates held till {holdUntil}.';
  const TEMPLATE_CONFIRMED = 'Hi {name}! Your {package} at NSG Royal Resort is confirmed.\n{dates} · {guests} guests\nTotal ₹{total}, to pay at the resort.\nYour booking: {link}';

  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const rand = (n) => { let s = ''; while (s.length < n) s += Math.random().toString(16).slice(2); return s.slice(0, n); };
  const store = () => (M.bookings ? M.bookings() : {});
  const save = (all) => { if (M.save) M.save(all); };
  const blocks = () => (M.blocks ? M.blocks() : []);
  const now = () => Date.now();
  const pkgOf = (id) => (M.info.packages || []).find((p) => p.id === id);
  const evOf = (id) => (M.info.eventTypes || []).find((e) => e.id === id);

  /** One balance rule for everything: total - advance received (CONFIRMED) or - agreed advance */
  function balanceOf(b) {
    const adv = b.status === 'CONFIRMED' ? num(b.advancePaid) : num(b.amount);
    return Math.max(0, num(b.total) - adv);
  }
  const remainingOf = (b) => Math.max(0, balanceOf(b) - num(b.balancePaid));

  /** Time moves the mock on: HOLD past expiry -> EXPIRED; submitted payments confirm after 20 s */
  function tick(b) {
    if (!b) return b;
    if (b.status === 'HOLD' && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() <= now()) b.status = 'EXPIRED';
    if (b.status === 'PAYMENT_SUBMITTED' && b.autoConfirmAt && now() >= b.autoConfirmAt) {
      b.status = 'CONFIRMED';
      b.advancePaid = num(b.amount);
      b.confirmedAt = new Date().toISOString();
      delete b.autoConfirmAt;
    }
    b.balance = balanceOf(b);
    return b;
  }

  function payBase() {
    try { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'pay.html'; } catch (e) { return 'pay.html'; }
  }
  const payUrlOf = (b) => payBase() + '?t=' + b.linkToken + (MOCK_PARAM ? '&mock=1' : '');

  function guestMessage(b) {
    const until = b.holdExpiresAt ? new Date(b.holdExpiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    const vars = {
      name: firstName(b.name), package: b.packageName || (evOf(b.eventType) || {}).name || 'booking',
      dates: `${dayLabel(b.checkIn)} – ${dayLabel(b.checkOut)}`, guests: b.guests,
      total: num(b.total).toLocaleString('en-IN'), advance: num(b.amount).toLocaleString('en-IN'),
      balance: balanceOf(b).toLocaleString('en-IN'), link: payUrlOf(b), holdUntil: until
    };
    return (b.source === 'walkin' ? TEMPLATE_CONFIRMED : TEMPLATE).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  const waUrlOf = (b, msg) => `https://wa.me/91${b.phone}?text=${encodeURIComponent(msg)}`;

  function linkResult(b) {
    const msg = guestMessage(b);
    return {
      bookingId: b.bookingId, token: b.linkToken, payUrl: payUrlOf(b), guestMessage: msg, waUrl: waUrlOf(b, msg),
      status: b.status, total: num(b.total), advance: num(b.amount), balance: balanceOf(b), holdExpiresAt: b.holdExpiresAt || null, warnings: []
    };
  }

  /** What holds a night: a manual block or an active booking (excluding one booking id) */
  function conflictFor(checkIn, checkOut, excludeId) {
    const all = store();
    const blk = blocks();
    for (const night of eachNight(checkIn, checkOut)) {
      const bl = blk.find((x) => x.date === night);
      if (bl) return { date: night, name: '', source: 'block', status: 'BLOCKED', bookingId: '' };
      const hit = Object.values(all).find((b) => b.bookingId !== excludeId && ACTIVE.includes(tick(b).status) && b.checkIn <= night && b.checkOut > night);
      if (hit) return { date: night, name: firstName(hit.name), source: hit.source || 'web', status: hit.status, bookingId: hit.bookingId };
    }
    return null;
  }

  function seedRow(id, o) {
    const today = M.today();
    const b = Object.assign({
      bookingId: id, createdAt: new Date(now() - 2 * 864e5).toISOString(), email: '', bookingType: 'stay', packageId: 'whole', packageName: (pkgOf('whole') || {}).name || '', eventType: null,
      nights: 2, guests: 6, addons: [], addonsTotal: 0, baseTotal: null, isSpecialPrice: false, priceNote: '', staffNote: '', source: 'link', createdBy: DEMO_NAME,
      advancePaid: null, balancePaid: 0, balanceMethod: '', confirmedAt: null, utr: null, requestId: '', holdExpiresAt: null, notes: ''
    }, o);
    b.checkIn = M.addDays(today, o.from);
    b.checkOut = M.addDays(today, o.from + (o.nights || 2));
    b.nights = o.nights || 2;
    b.balance = balanceOf(b);
    return b;
  }

  /** Mock bookings in every status (added once; the HOLD demo is kept alive so pay.html?t=DEMO always works) */
  function ensureSeed() {
    const all = store();
    let changed = false;
    if (!all['BK-LINK-HOLD']) {
      const biryani = { id: 'food-biryani', name: 'Mock Biryani package', qty: 8, unitPrice: 250, lineTotal: 2000, confirmRequired: true };
      [
        seedRow('BK-LINK-HOLD', { name: 'Ravi Kumar', phone: '9876511111', from: 12, status: 'HOLD', linkToken: 'DEMO', amount: 5000, total: 42000, baseTotal: 90000, addons: [biryani], addonsTotal: 2000, isSpecialPrice: true, priceNote: 'Repeat guest', holdExpiresAt: new Date(now() + 23 * 36e5).toISOString() }),
        seedRow('BK-LINK-PEND', { name: 'Priya Sharma', phone: '9876522222', from: 7, status: 'PAYMENT_SUBMITTED', linkToken: 'DEMO2', packageId: 'penthouse', packageName: (pkgOf('penthouse') || {}).name || '', guests: 4, amount: 5000, total: 35000, utr: 'UTR123456789012', holdExpiresAt: new Date(now() + 6 * 36e5).toISOString() }),
        seedRow('BK-LINK-CONF', { name: 'Arjun Reddy', phone: '9876533333', from: 25, status: 'CONFIRMED', linkToken: 'DEMO3', amount: 10000, advancePaid: 10000, total: 90000, confirmedAt: new Date(now() - 864e5).toISOString() }),
        seedRow('BK-LINK-EXP', { name: 'Meena Rao', phone: '9876544444', from: 2, status: 'EXPIRED', linkToken: 'DEMO4', amount: 5000, total: 80000, holdExpiresAt: new Date(now() - 36e5).toISOString() }),
        seedRow('BK-LINK-REJ', { name: 'Suresh Babu', phone: '9876555555', from: 30, status: 'REJECTED', linkToken: 'DEMO5', amount: 5000, total: 80000, utr: 'UTR000011112222' }),
        seedRow('BK-LINK-CAN', { name: 'Lakshmi Devi', phone: '9876566666', from: 33, status: 'CANCELLED', linkToken: 'DEMO6', amount: 5000, total: 80000 }),
        seedRow('BK-WALK-0001', { name: 'Kiran Varma', phone: '9876577777', from: 40, status: 'CONFIRMED', source: 'walkin', linkToken: 'DEMO7', amount: 0, advancePaid: 0, total: 80000, staffNote: 'Trusted guest, pays at the resort', confirmedAt: new Date(now() - 864e5).toISOString() }),
        seedRow('BK-DEMO-TODAY', { name: 'Anita Joseph', phone: '9876588888', from: 0, status: 'CONFIRMED', source: 'web', createdBy: '', linkToken: '', amount: 10000, advancePaid: 10000, total: 80000, confirmedAt: new Date(now() - 5 * 864e5).toISOString() })
      ].forEach((b) => { all[b.bookingId] = b; });
      changed = true;
    } else if (all['BK-LINK-HOLD'].status === 'HOLD' && new Date(all['BK-LINK-HOLD'].holdExpiresAt).getTime() <= now()) {
      all['BK-LINK-HOLD'].holdExpiresAt = new Date(now() + 23 * 36e5).toISOString();
      changed = true;
    }
    // A finished stay, so "Ask for review" can be tried (added once, also to older mock data)
    if (!all['BK-DEMO-PAST']) {
      all['BK-DEMO-PAST'] = seedRow('BK-DEMO-PAST', { name: 'Neha Gupta', phone: '9876599999', from: -6, status: 'CONFIRMED', source: 'web', createdBy: '', linkToken: '', amount: 10000, advancePaid: 10000, total: 80000, balancePaid: 70000, balanceMethod: 'cash', confirmedAt: new Date(now() - 10 * 864e5).toISOString() });
      changed = true;
    }
    if (changed) save(all);
    return all;
  }

  function mockGetByToken(t) {
    const all = ensureSeed();
    const b = Object.values(all).find((x) => x.linkToken && x.linkToken === t && (x.source === 'link' || x.source === 'walkin'));
    if (!b) return fail('NOT_FOUND');
    const before = b.status;
    tick(b);
    if (b.status !== before) save(all);
    const booking = {
      bookingId: b.bookingId, firstName: firstName(b.name), status: b.status, bookingType: b.bookingType,
      packageName: b.packageName || '', eventType: b.eventType || '', checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, guests: b.guests,
      addons: (b.addons || []).map((l) => ({ name: l.name, qty: l.qty, line: l.lineTotal })),
      total: num(b.total), advance: num(b.amount), advancePaid: b.status === 'CONFIRMED' ? num(b.advancePaid) : null, balance: balanceOf(b),
      isSpecialPrice: !!b.isSpecialPrice, holdExpiresAt: b.holdExpiresAt || null, checkInTime: M.info.checkInTime, checkOutTime: M.info.checkOutTime
    };
    const upiId = 'nsgresort@upi';
    const payment = b.status !== 'HOLD' ? null : {
      mode: 'upi', upiId: upiId, payeeName: 'NSG Royal Resort', amount: num(b.amount),
      upiLink: `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('NSG Royal Resort')}&am=${num(b.amount)}&cu=INR&tn=Booking+${b.bookingId}&tr=${b.bookingId}`,
      note: `Booking ${b.bookingId}`
    };
    return { ok: true, data: { booking: booking, payment: payment } };
  }

  // ---- Mock staff session and lockout ----
  function session() { try { return JSON.parse(ls.get(SESSION_KEY)) || null; } catch (e) { return null; } }
  function requireAuth() {
    const s = session();
    if (!s || !staffToken || s.token !== staffToken) { authLost('AUTH'); return fail('AUTH'); }
    return null;
  }
  function mockLogin(p) {
    let f = { count: 0, lockedUntil: 0 };
    try { f = Object.assign(f, JSON.parse(ls.get(PINFAIL_KEY)) || {}); } catch (e) {}
    if (f.lockedUntil > now()) return fail('LOCKED', { minutes: Math.ceil((f.lockedUntil - now()) / 60000) });
    if (String(p.pin) !== DEMO_PIN) {
      f.count += 1;
      if (f.count >= 5) { f = { count: 0, lockedUntil: now() + 15 * 60000 }; ls.set(PINFAIL_KEY, JSON.stringify(f)); return fail('LOCKED', { minutes: 15 }); }
      ls.set(PINFAIL_KEY, JSON.stringify(f));
      return fail('AUTH');
    }
    ls.set(PINFAIL_KEY, null);
    const s = { token: rand(40), name: DEMO_NAME, deviceId: p.deviceId || '' };
    ls.set(SESSION_KEY, JSON.stringify(s));
    return { ok: true, data: { token: s.token, name: s.name } };
  }

  /** Standard total, final total, default advance and warnings for a stay or event */
  async function quoteFor(p) {
    const isEvent = p.bookingType === 'event';
    const ci = p.checkIn;
    const co = p.checkOut || (isEvent && isDateStr(ci) ? M.addDays(ci, 1) : '');
    if (!isDateStr(ci) || !isDateStr(co)) return fail('INVALID_DATE');
    if (co <= ci) return fail('INVALID_RANGE');
    const nights = nightsBetween(ci, co);
    const guests = Math.max(1, Math.round(num(p.guests)) || 1);
    let pkg = null, ev = null, base = null, lines = [], addonsTotal = 0, standard = null, breakdown = [];
    if (isEvent) {
      ev = evOf(p.eventType);
      if (!ev) return fail('INVALID_EVENT_TYPE');
      const pr = M.price(p.addons, guests, nights);
      if (pr.error) return fail('INVALID_ADDON', { detail: 'Check the add-on quantities (minimum and maximum).' });
      lines = pr.lines; addonsTotal = pr.total;
      if (!(num(p.specialTotal) > 0)) return fail('SPECIAL_TOTAL_REQUIRED');
    } else {
      pkg = pkgOf(p.package);
      if (!pkg) return fail('INVALID_PACKAGE');
      const cap = pkg.maxGuests + (pkg.extraGuestFee ? pkg.maxExtraGuests : 0);
      if (guests > cap) return fail('MAX_GUESTS', { detail: `Maximum ${cap} guests for ${pkg.name}.` });
      if (nights < M.info.minNights) return fail('MIN_NIGHTS');
      const q = await api.getQuote(pkg.id, ci, co, guests, p.addons);
      if (!q.ok) return q;
      base = q.data.baseTotal; lines = q.data.addonsBreakdown; addonsTotal = q.data.addonsTotal; standard = q.data.total; breakdown = q.data.breakdown;
    }
    const special = p.specialTotal === '' || p.specialTotal === null || p.specialTotal === undefined ? null : Math.round(num(p.specialTotal));
    if (special !== null && special <= 0) return fail('INVALID_PRICE');
    const finalTotal = special !== null ? special : standard;
    const defAdv = isEvent ? ev.advance : pkg.advance;
    const advance = p.advance === undefined || p.advance === '' || p.advance === null ? defAdv : Math.round(num(p.advance));
    const warnings = [];
    if (advance < MIN_ADV) warnings.push(`Advance is below minimum ${inr(MIN_ADV)}`);
    if (advance > finalTotal) warnings.push(`Advance is more than the total ${inr(finalTotal)}`);
    if (special !== null && standard) {
      const pct = Math.round(Math.abs(special - standard) / standard * 100);
      if (pct) warnings.push(`Special price is ${pct}% ${special < standard ? 'below' : 'above'} standard (${inr(standard)})`);
    }
    return { ok: true, data: {
      bookingType: isEvent ? 'event' : 'stay', package: pkg ? pkg.id : '', packageName: pkg ? pkg.name : '', eventType: ev ? ev.id : '',
      checkIn: ci, checkOut: co, nights: nights, guests: guests, breakdown: breakdown, baseTotal: base, addonsBreakdown: lines, addonsTotal: addonsTotal,
      standardTotal: standard, finalTotal: finalTotal, isSpecialPrice: special !== null, advance: advance, minAdvance: MIN_ADV,
      balance: Math.max(0, finalTotal - advance), warnings: warnings
    } };
  }

  async function mockCreateLink(p) {
    const all = ensureSeed();
    if (p.requestId) {
      const dup = Object.values(all).find((b) => b.requestId && b.requestId === p.requestId);
      if (dup) return { ok: true, data: Object.assign(linkResult(tick(dup)), { duplicate: true }) };
    }
    const phone = cleanPhone(p.phone);
    if (!/^\d{10}$/.test(phone)) return fail('INVALID_PHONE');
    if (!String(p.name || '').trim()) return fail('MISSING_FIELD', { detail: 'Guest name is required.' });
    if (isDateStr(p.checkIn) && p.checkIn < M.today()) return fail('PAST_DATE');
    const q = await quoteFor(p);
    if (!q.ok) return q;
    const d = q.data;
    const hold = p.holdHours === undefined || p.holdHours === '' ? 24 : num(p.holdHours);
    if (![6, 12, 24, 48].includes(hold)) return fail('INVALID_HOLD_HOURS');
    const noAdv = !!p.confirmWithoutAdvance;
    if (noAdv && !String(p.note || '').trim()) return fail('NOTE_REQUIRED');
    if (!noAdv && (!Number.isInteger(d.advance) || d.advance < MIN_ADV || d.advance > d.finalTotal)) {
      return fail('INVALID_ADVANCE', { minAdvance: MIN_ADV, maxAdvance: d.finalTotal, detail: `Advance must be from ${inr(MIN_ADV)} to ${inr(d.finalTotal)}.` });
    }
    const c = conflictFor(d.checkIn, d.checkOut);
    if (c) return fail('DATES_UNAVAILABLE', { conflict: c });
    const id = 'BK-' + rand(6).toUpperCase();
    const ts = new Date().toISOString();
    const b = {
      bookingId: id, createdAt: ts, name: String(p.name).trim(), phone: phone, email: '', bookingType: d.bookingType,
      packageId: d.package || null, packageName: d.packageName, eventType: d.eventType || null, guests: d.guests,
      checkIn: d.checkIn, checkOut: d.checkOut, nights: d.nights, amount: noAdv ? 0 : d.advance, total: d.finalTotal, baseTotal: d.baseTotal,
      addons: d.addonsBreakdown, addonsTotal: d.addonsTotal, isSpecialPrice: d.isSpecialPrice, priceNote: String(p.priceNote || ''), staffNote: String(p.note || ''),
      status: noAdv ? 'CONFIRMED' : 'HOLD', source: noAdv ? 'walkin' : 'link', linkToken: rand(32), createdBy: session().name,
      holdExpiresAt: noAdv ? null : new Date(now() + hold * 36e5).toISOString(), advancePaid: noAdv ? 0 : null, balancePaid: 0, balanceMethod: '',
      confirmedAt: noAdv ? ts : null, utr: null, requestId: String(p.requestId || ''), notes: ''
    };
    b.balance = balanceOf(b);
    all[id] = b;
    save(all);
    return { ok: true, data: Object.assign(linkResult(b), { warnings: d.warnings }) };
  }

  async function mockUpdateLink(p) {
    const all = ensureSeed();
    const b = all[p.bookingId];
    if (!b) return fail('NOT_FOUND');
    tick(b);
    if (b.source !== 'link') return fail('NOT_A_LINK');
    if (!['HOLD', 'PAYMENT_SUBMITTED'].includes(b.status)) return fail('INVALID_STATUS');
    const f = p.fields || {};
    const has = (k) => f[k] !== undefined;
    const next = {
      bookingType: b.bookingType, package: has('package') ? f.package : b.packageId, eventType: has('eventType') ? f.eventType : b.eventType,
      checkIn: has('checkIn') ? f.checkIn : b.checkIn, checkOut: has('checkOut') ? f.checkOut : b.checkOut, guests: has('guests') ? f.guests : b.guests,
      addons: has('addons') ? f.addons : (b.addons || []).map((l) => ({ id: l.id, qty: l.qty })),
      specialTotal: has('specialTotal') ? (f.specialTotal === '' ? null : f.specialTotal) : (b.isSpecialPrice ? b.total : null),
      advance: has('advance') && b.status === 'HOLD' ? f.advance : b.amount
    };
    const q = await quoteFor(next);
    if (!q.ok) return q;
    const d = q.data;
    if (b.status === 'HOLD' && (d.advance < MIN_ADV || d.advance > d.finalTotal)) return fail('INVALID_ADVANCE', { minAdvance: MIN_ADV, maxAdvance: d.finalTotal });
    if (d.checkIn !== b.checkIn || d.checkOut !== b.checkOut) {
      const c = conflictFor(d.checkIn, d.checkOut, b.bookingId);
      if (c) return fail('DATES_UNAVAILABLE', { conflict: c });
    }
    const before = { checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests, package: b.packageId, eventType: b.eventType, addons: JSON.stringify(b.addons), specialTotal: b.isSpecialPrice ? b.total : null, advance: b.amount, name: b.name, note: b.staffNote, total: b.total };
    Object.assign(b, {
      checkIn: d.checkIn, checkOut: d.checkOut, nights: d.nights, guests: d.guests, packageId: d.package || null, packageName: d.packageName, eventType: d.eventType || null,
      addons: d.addonsBreakdown, addonsTotal: d.addonsTotal, baseTotal: d.baseTotal, total: d.finalTotal, isSpecialPrice: d.isSpecialPrice, amount: d.advance,
      name: has('name') && String(f.name).trim() ? String(f.name).trim() : b.name, staffNote: has('note') ? String(f.note) : b.staffNote,
      priceNote: has('priceNote') ? String(f.priceNote) : b.priceNote, updatedBy: session().name, updatedAt: new Date().toISOString()
    });
    b.balance = balanceOf(b);
    const after = { checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests, package: b.packageId, eventType: b.eventType, addons: JSON.stringify(b.addons), specialTotal: b.isSpecialPrice ? b.total : null, advance: b.amount, name: b.name, note: b.staffNote, total: b.total };
    const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
    save(all);
    return { ok: true, data: Object.assign(linkResult(b), { changed: changed, warnings: d.warnings }) };
  }

  function listRow(b) {
    return {
      bookingId: b.bookingId, firstName: firstName(b.name), phoneLast4: String(b.phone || '').slice(-4), checkIn: b.checkIn, checkOut: b.checkOut,
      nights: b.nights, guests: b.guests, bookingType: b.bookingType, package: b.packageId || '', packageName: b.packageName || '', eventType: b.eventType || '',
      status: b.status, source: b.source || 'web', total: num(b.total), advance: num(b.amount), advancePaid: b.advancePaid === null || b.advancePaid === undefined ? null : num(b.advancePaid),
      balance: balanceOf(b), balancePaid: num(b.balancePaid), remaining: remainingOf(b), isSpecialPrice: !!b.isSpecialPrice, createdBy: b.createdBy || '',
      holdExpiresAt: b.holdExpiresAt || null, token: b.linkToken || ''
    };
  }

  async function mockStaff(action, p) {
    if (action === 'staffLogin') return mockLogin(p);
    const denied = requireAuth();
    if (denied) return denied;
    const all = ensureSeed();
    const me = session().name;
    const find = () => { const b = all[p.bookingId]; if (b) tick(b); return b; };
    const invalidDates = () => (!isDateStr(p.from) || !isDateStr(p.to) || p.to <= p.from ? fail('INVALID_DATE') : null);
    switch (action) {
      case 'staffMe': return { ok: true, data: { name: me } };
      case 'staffLogout': ls.set(SESSION_KEY, null); return { ok: true, data: { message: 'Logged out.' } };
      case 'staffLookupPhone': {
        const phone = cleanPhone(p.phone);
        const rows = Object.values(all).filter((b) => b.phone === phone).map(tick);
        if (!rows.length) return { ok: true, data: { found: false } };
        const conf = rows.filter((b) => b.status === 'CONFIRMED').sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
        const last = conf[0] ? new Date(utc(conf[0].checkIn)) : null;
        return { ok: true, data: { found: true, name: rows[rows.length - 1].name, visits: conf.length, lastStay: last ? `${MONS[last.getUTCMonth()]} ${last.getUTCFullYear()}` : '' } };
      }
      case 'staffQuote': return quoteFor(p);
      case 'staffCreateLink': return mockCreateLink(p);
      case 'staffUpdateLink': return mockUpdateLink(p);
      case 'staffExtendHold': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (![6, 24].includes(num(p.hours))) return fail('INVALID_HOLD_HOURS');
        if (b.status === 'HOLD') b.holdExpiresAt = new Date(new Date(b.holdExpiresAt).getTime() + num(p.hours) * 36e5).toISOString();
        else if (b.status === 'EXPIRED') {
          const c = conflictFor(b.checkIn, b.checkOut, b.bookingId);
          if (c) return fail('DATES_UNAVAILABLE', { conflict: c });
          b.status = 'HOLD';
          b.holdExpiresAt = new Date(now() + num(p.hours) * 36e5).toISOString();
          save(all);
          return { ok: true, data: { bookingId: b.bookingId, status: 'HOLD', holdExpiresAt: b.holdExpiresAt, revived: true } };
        } else return fail('INVALID_STATUS');
        save(all);
        return { ok: true, data: { bookingId: b.bookingId, status: b.status, holdExpiresAt: b.holdExpiresAt, revived: false } };
      }
      case 'staffConfirm': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (b.status === 'CONFIRMED') return { ok: true, data: { bookingId: b.bookingId, status: 'CONFIRMED', already: true, advancePaid: num(b.advancePaid), balance: balanceOf(b), warnings: [] } };
        if (!(b.status === 'PAYMENT_SUBMITTED' || (b.status === 'EXPIRED' && b.utr))) return fail('INVALID_STATUS');
        if (b.status === 'EXPIRED') { const c = conflictFor(b.checkIn, b.checkOut, b.bookingId); if (c) return fail('DATES_TAKEN', { conflict: c }); }
        const received = p.amountReceived === undefined ? num(b.amount) : Math.round(num(p.amountReceived));
        if (received < 0) return fail('INVALID_AMOUNT');
        const warnings = received !== num(b.amount) ? [`Received ${inr(received)} but the agreed advance was ${inr(b.amount)}`] : [];
        Object.assign(b, { status: 'CONFIRMED', advancePaid: received, confirmedAt: new Date().toISOString(), updatedBy: me });
        delete b.autoConfirmAt;
        b.balance = balanceOf(b);
        save(all);
        return { ok: true, data: { bookingId: b.bookingId, status: 'CONFIRMED', already: false, advancePaid: received, balance: b.balance, warnings: warnings } };
      }
      case 'staffReject': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (b.status === 'REJECTED') return { ok: true, data: { bookingId: b.bookingId, status: 'REJECTED', already: true } };
        if (b.status !== 'PAYMENT_SUBMITTED') return fail('INVALID_STATUS');
        Object.assign(b, { status: 'REJECTED', updatedBy: me });
        delete b.autoConfirmAt;
        save(all);
        return { ok: true, data: { bookingId: b.bookingId, status: 'REJECTED', already: false } };
      }
      case 'staffCollectBalance': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (b.status !== 'CONFIRMED') return fail('INVALID_STATUS');
        if (!['cash', 'upi', 'other'].includes(String(p.method))) return fail('INVALID_METHOD');
        const amt = Math.round(num(p.amount));
        const remaining = remainingOf(b);
        if (!(amt > 0) || amt > remaining) return fail('INVALID_AMOUNT', { remaining: remaining });
        Object.assign(b, { balancePaid: num(b.balancePaid) + amt, balanceMethod: p.method, settledAt: new Date().toISOString(), settledBy: me });
        save(all);
        return { ok: true, data: { bookingId: b.bookingId, balancePaid: b.balancePaid, balanceMethod: b.balanceMethod, remaining: remainingOf(b) } };
      }
      case 'staffCancel': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (b.status === 'CANCELLED') return { ok: true, data: { bookingId: b.bookingId, status: 'CANCELLED', already: true } };
        if (!['HOLD', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'EXPIRED'].includes(b.status)) return fail('INVALID_STATUS');
        Object.assign(b, { status: 'CANCELLED', updatedBy: me, staffNote: [b.staffNote, p.reason ? 'Cancelled: ' + p.reason : ''].filter(Boolean).join(' · ') });
        save(all);
        return { ok: true, data: { bookingId: b.bookingId, status: 'CANCELLED', already: false } };
      }
      case 'staffBlock': {
        const dates = (p.dates || []).filter(isDateStr);
        if (!dates.length || dates.length > 60) return fail('INVALID_DATE');
        for (const d of dates) {
          const hit = Object.values(all).find((b) => ACTIVE.includes(tick(b).status) && b.checkIn <= d && b.checkOut > d);
          if (hit) return fail('DATES_UNAVAILABLE', { conflict: { date: d, name: firstName(hit.name), source: hit.source || 'web', status: hit.status, bookingId: hit.bookingId } });
        }
        const list = blocks();
        const already = [], blocked = [];
        dates.forEach((d) => {
          if (list.some((x) => x.date === d)) already.push(d);
          else { list.push({ date: d, reason: String(p.note || ''), addedBy: me }); blocked.push(d); }
        });
        M.saveBlocks(list);
        return { ok: true, data: { blocked: blocked, alreadyBlocked: already } };
      }
      case 'staffUnblock': {
        const dates = (p.dates || []).filter(isDateStr);
        const list = blocks();
        const un = [], not = [];
        dates.forEach((d) => (list.some((x) => x.date === d) ? un.push(d) : not.push(d)));
        M.saveBlocks(list.filter((x) => !un.includes(x.date)));
        return { ok: true, data: { unblocked: un, notBlocked: not } };
      }
      case 'staffList': {
        const bad = invalidDates();
        if (bad) return bad;
        const rows = Object.values(all).map(tick).filter((b) => b.checkIn < p.to && b.checkOut > p.from).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1)).map(listRow);
        const blk = blocks().filter((x) => x.date >= p.from && x.date < p.to).map((x) => ({ blockId: 'BLOCK-' + x.date, date: x.date, reason: x.reason || '', addedBy: x.addedBy || '' }));
        save(all);
        return { ok: true, data: { from: p.from, to: p.to, bookings: rows, blocks: blk } };
      }
      case 'staffCalendar': {
        const bad = invalidDates();
        if (bad) return bad;
        const rank = { free: 0, blocked: 1, hold: 2, pending: 3, confirmed: 4 };
        const byStatus = { HOLD: 'hold', PAYMENT_SUBMITTED: 'pending', CONFIRMED: 'confirmed' };
        const active = Object.values(all).map(tick).filter((b) => ACTIVE.includes(b.status));
        const blk = new Set(blocks().map((x) => x.date));
        const days = eachNight(p.from, p.to).map((d) => {
          let state = blk.has(d) ? 'blocked' : 'free';
          active.forEach((b) => { if (b.checkIn <= d && b.checkOut > d && rank[byStatus[b.status]] > rank[state]) state = byStatus[b.status]; });
          return { date: d, state: state };
        });
        return { ok: true, data: { from: p.from, to: p.to, days: days } };
      }
      case 'staffBooking': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        return { ok: true, data: { booking: Object.assign(listRow(b), {
          name: b.name, phone: b.phone, email: b.email || '', utr: b.utr || '', notes: b.notes || '', staffNote: b.staffNote || '', priceNote: b.priceNote || '',
          createdAt: b.createdAt, confirmedAt: b.confirmedAt || null, updatedBy: b.updatedBy || '', updatedAt: b.updatedAt || null,
          balanceMethod: b.balanceMethod || '', settledAt: b.settledAt || null, settledBy: b.settledBy || '', addons: b.addons || [], addonsTotal: num(b.addonsTotal),
          baseTotal: b.baseTotal, payUrl: b.linkToken ? payUrlOf(b) : '', requestId: b.requestId || ''
        }) } };
      }
      case 'staffResendMessage': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (!b.linkToken) return fail('NOT_A_LINK');
        const msg = guestMessage(b);
        return { ok: true, data: { bookingId: b.bookingId, status: b.status, payUrl: payUrlOf(b), guestMessage: msg, waUrl: waUrlOf(b, msg) } };
      }
      case 'staffReviewMessage': {
        const b = find();
        if (!b) return fail('NOT_FOUND');
        if (b.status !== 'CONFIRMED') return fail('INVALID_STATUS');
        const msg = `Hi ${firstName(b.name)}! Thank you for choosing NSG Royal Resort. We hope you had a wonderful time with us.\nIf you have a minute, a Google review would mean a lot to us: https://example.com/MOCK-review-link\nThank you!`;
        return { ok: true, data: { bookingId: b.bookingId, message: msg, waUrl: waUrlOf(b, msg) } };
      }
      default: return fail('GENERIC_ERROR', { detail: 'Unknown action ' + action });
    }
  }
  /* MOCK:END */
})();
