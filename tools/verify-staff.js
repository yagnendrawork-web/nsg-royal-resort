/**
 * NSG ROYAL RESORT — STAFF / PAY-LINK MOCK VERIFY (node tools/verify-staff.js)
 * Runs src/js/api.js + api.link.js in a sandbox with USE_MOCK and checks the server rules the
 * mocks mirror: balance maths, advance clamping, requestId reuse, token privacy, confirm/collect.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8');
const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'site.json'), 'utf8'));

const mem = {};
const sandbox = {
  console, setTimeout, clearTimeout, Date, Math, JSON, Number, String, Object, Array, Promise, Intl, isFinite, encodeURIComponent, decodeURIComponent, Set,
  localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
  CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
  AbortController: function () { this.signal = {}; this.abort = () => {}; }
};
sandbox.window = sandbox;
sandbox.window.NSG = { CONFIG: { USE_MOCK: true, API_URL: '' }, UI: site.ui };
sandbox.window.dispatchEvent = (e) => { events.push(e.type); };
const events = [];
vm.createContext(sandbox);
vm.runInContext(src('api.js'), sandbox, { filename: 'api.js' });
vm.runInContext(src('api.link.js'), sandbox, { filename: 'api.link.js' });
const api = sandbox.window.NSG.api;

let fails = 0;
function check(label, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  -> ' + extra : ''}`);
  if (!cond) fails++;
}

(async () => {
  const today = api._mock.today();
  const day = (n) => api._mock.addDays(today, n);
  // Free nights in the mock: +4,+5,+9,+18..+20 are blocked; +12..+14 held by DEMO; +7,+8 pending; today..+2 confirmed
  const ci = day(50), co = day(52);

  // Login: wrong PIN, lockout after 5, right PIN
  let r = await api.staffLogin('111111', 'dev-1');
  check('wrong PIN -> AUTH', !r.ok && r.code === 'AUTH', r.code);
  for (let i = 0; i < 4; i++) r = await api.staffLogin('111111', 'dev-1');
  check('5th wrong PIN -> LOCKED with minutes', r.code === 'LOCKED' && r.lockedMinutes === 15, `${r.code} ${r.lockedMinutes}m`);
  mem.nsg_mock_pinfail = JSON.stringify({ count: 0, lockedUntil: 0 });
  r = await api.staffLogin('246810', 'dev-1');
  check('PIN 246810 -> Demo Staff + token stored', r.ok && r.data.name === 'Demo Staff' && api.getStaffToken() === r.data.token);

  // Balance rule for total 42000
  const base = { bookingType: 'stay', package: 'whole', checkIn: ci, checkOut: co, guests: 6, addons: [], specialTotal: 42000 };
  for (const [adv, want] of [[5000, 37000], [10000, 32000]]) {
    r = await api.staffQuote(Object.assign({}, base, { advance: adv }));
    check(`quote total 42000, advance ${adv} -> balance ${want}`, r.ok && r.data.finalTotal === 42000 && r.data.balance === want, r.ok ? `balance ${r.data.balance}, warnings ${JSON.stringify(r.data.warnings)}` : r.code);
  }
  r = await api.staffQuote(Object.assign({}, base, { advance: 500 }));
  check('advance 500 -> warning below minimum', r.ok && r.data.warnings.some((w) => /below minimum/.test(w)), JSON.stringify(r.data && r.data.warnings));

  // Advance clamping on create
  const mk = (extra) => Object.assign({ requestId: 'req-' + Math.random().toString(36).slice(2), name: 'Ravi Kumar', phone: '98765 11111', holdHours: 24 }, base, extra);
  r = await api.staffCreateLink(mk({ advance: 500 }));
  check('create with advance 500 -> INVALID_ADVANCE 1000..42000', r.code === 'INVALID_ADVANCE' && r.minAdvance === 1000 && r.maxAdvance === 42000, `${r.code} ${r.minAdvance}-${r.maxAdvance}`);
  r = await api.staffCreateLink(mk({ advance: 50000 }));
  check('create with advance 50000 -> INVALID_ADVANCE', r.code === 'INVALID_ADVANCE', r.code);
  r = await api.staffCreateLink(mk({ advance: 5000, confirmWithoutAdvance: true }));
  check('confirm without advance needs a note -> NOTE_REQUIRED', r.code === 'NOTE_REQUIRED', r.code);

  // requestId reuse
  const reqId = 'req-fixed-1';
  const a = await api.staffCreateLink(mk({ requestId: reqId, advance: 5000 }));
  const b = await api.staffCreateLink(mk({ requestId: reqId, advance: 5000 }));
  check('create link -> HOLD, total 42000, advance 5000, balance 37000', a.ok && a.data.status === 'HOLD' && a.data.total === 42000 && a.data.advance === 5000 && a.data.balance === 37000, a.ok ? a.data.bookingId : a.code + ' ' + (a.detail || ''));
  check('same requestId again -> same booking, duplicate:true', b.ok && b.data.bookingId === a.data.bookingId && b.data.duplicate === true);
  check('guestMessage has dates, amounts and link', a.ok && /Total ₹42,000/.test(a.data.guestMessage) && /advance ₹5,000/.test(a.data.guestMessage) && a.data.guestMessage.includes(a.data.payUrl) && /wa\.me\/919876511111/.test(a.data.waUrl));

  // Conflict info
  r = await api.staffCreateLink(mk({ advance: 5000 }));
  check('same dates again -> DATES_UNAVAILABLE with conflict', r.code === 'DATES_UNAVAILABLE' && r.conflict && r.conflict.name === 'Ravi' && r.conflict.source === 'link' && r.conflict.status === 'HOLD', JSON.stringify(r.conflict));
  r = await api.staffCreateLink(mk({ advance: 5000, checkIn: day(4), checkOut: day(6) }));
  check('blocked night -> conflict source block', r.code === 'DATES_UNAVAILABLE' && r.conflict.source === 'block' && r.conflict.status === 'BLOCKED', JSON.stringify(r.conflict));

  // Without-advance mode: balance = total
  r = await api.staffCreateLink(mk({ advance: 0, confirmWithoutAdvance: true, note: 'Trusted guest', checkIn: day(60), checkOut: day(62) }));
  check('confirmWithoutAdvance -> CONFIRMED, advance 0, balance 42000', r.ok && r.data.status === 'CONFIRMED' && r.data.advance === 0 && r.data.balance === 42000, r.ok ? '' : r.code);
  const walk = r.ok ? r.data.bookingId : '';

  // Guest side: token view hides private fields, pay by token, confirm with a different amount
  r = await api.getByToken(a.data.token);
  const g = r.ok ? r.data.booking : {};
  check('getByToken -> HOLD with payment, firstName only', r.ok && g.status === 'HOLD' && g.firstName === 'Ravi' && r.data.payment && r.data.payment.amount === 5000);
  check('getByToken hides phone/email/utr/createdBy/notes', r.ok && ['phone', 'email', 'utr', 'createdBy', 'staffNote', 'name'].every((k) => !(k in g)), Object.keys(g).join(','));
  r = await api.getByToken('DEMO');
  check('token DEMO -> HOLD demo booking', r.ok && r.data.booking.status === 'HOLD' && r.data.booking.isSpecialPrice === true, r.ok ? r.data.booking.bookingId : r.code);
  r = await api.getByToken('nope');
  check('unknown token -> NOT_FOUND', r.code === 'NOT_FOUND');
  r = await api.submitPayment({ token: a.data.token }, 'utr123456789');
  check('submitPayment by token -> PAYMENT_SUBMITTED', r.ok && r.data.bookingId === a.data.bookingId);
  r = await api.getByToken(a.data.token);
  check('getByToken after payment -> PAYMENT_SUBMITTED, payment null', r.ok && r.data.booking.status === 'PAYMENT_SUBMITTED' && r.data.payment === null);
  r = await api.staffBooking(a.data.bookingId);
  check('staffBooking shows phone and UTR to staff', r.ok && r.data.booking.phone === '9876511111' && r.data.booking.utr === 'UTR123456789');
  r = await api.staffConfirm(a.data.bookingId, 4000);
  check('staffConfirm 4000 -> advancePaid 4000, balance 38000, warning', r.ok && r.data.advancePaid === 4000 && r.data.balance === 38000 && r.data.warnings.length === 1, r.ok ? r.data.warnings[0] : r.code);
  r = await api.staffConfirm(a.data.bookingId);
  check('staffConfirm again -> already:true', r.ok && r.data.already === true);
  r = await api.staffCollectBalance(a.data.bookingId, 40000, 'cash');
  check('collect more than remaining -> INVALID_AMOUNT with remaining', r.code === 'INVALID_AMOUNT' && r.remaining === 38000, `${r.code} remaining ${r.remaining}`);
  r = await api.staffCollectBalance(a.data.bookingId, 38000, 'cash');
  check('collect 38000 cash -> remaining 0', r.ok && r.data.remaining === 0);

  // Extend / revive, list, calendar, block conflicts
  r = await api.staffExtendHold('BK-LINK-EXP', 6);
  check('extend EXPIRED link -> revived HOLD', r.ok && r.data.revived === true && r.data.status === 'HOLD');
  r = await api.staffList(day(0), day(70));
  check('staffList includes link, walkin and web rows', r.ok && ['link', 'walkin', 'web'].every((s) => r.data.bookings.some((x) => x.source === s)) && r.data.blocks.length >= 3, r.ok ? `${r.data.bookings.length} bookings, ${r.data.blocks.length} blocks` : r.code);
  r = await api.staffCalendar(day(0), day(16));
  const st = r.ok ? Object.fromEntries(r.data.days.map((d) => [d.date, d.state])) : {};
  check('staffCalendar states: today confirmed, +4 blocked, +7 pending, +12 hold', st[day(0)] === 'confirmed' && st[day(4)] === 'blocked' && st[day(7)] === 'pending' && st[day(12)] === 'hold', JSON.stringify([st[day(0)], st[day(4)], st[day(7)], st[day(12)]]));
  r = await api.staffBlock([day(12)], 'test');
  check('block a held date -> DATES_UNAVAILABLE with conflict', r.code === 'DATES_UNAVAILABLE' && r.conflict.date === day(12));
  r = await api.staffBlock([day(70), day(71)], 'Maintenance');
  check('block two free dates', r.ok && r.data.blocked.length === 2);
  r = await api.staffUnblock([day(70), day(99)]);
  check('unblock one, one not blocked', r.ok && r.data.unblocked.length === 1 && r.data.notBlocked.length === 1);
  r = await api.staffCancel(walk, 'Guest changed plans');
  check('cancel walk-in -> CANCELLED', r.ok && r.data.status === 'CANCELLED');

  // AUTH event
  api.setStaffToken('bad-token');
  r = await api.staffMe();
  check('bad token -> AUTH, token cleared, nsg:staff-auth fired', r.code === 'AUTH' && api.getStaffToken() === '' && events.includes('nsg:staff-auth'));

  console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll staff/pay-link mock checks passed');
  process.exit(fails ? 1 : 0);
})();
