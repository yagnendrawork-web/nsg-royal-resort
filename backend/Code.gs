/**
 * NSG Royal Resort – Booking Backend
 * Runtime : Google Apps Script (V8)
 * Database: Google Sheets
 * Alerts  : Telegram Bot
 *
 * Sections
 *  1. Constants & Helpers
 *  2. Sheet Bootstrap  (setupSheets, installTriggers, setWebhook)
 *  3. HTTP Router      (doGet, doPost)
 *  4. Action Handlers  (info, availability, quote, createBooking, submitPayment, eventEnquiry)
 *  5. Telegram Webhook (handleTelegramWebhook, confirm/reject logic)
 *  6. Telegram API     (sendMessage, editMessageText, answerCallbackQuery)
 *  7. Email            (sendGuestEmail, sendGuestWhatsApp stub)
 *  8. Hold Expiry      (expireHolds – called by time-driven trigger)
 *  9. Validation       (date, phone, input sanitisers, rate limiter)
 * 10. Test Functions   (runnable from the Apps Script editor)
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 – CONSTANTS & LOW-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Sheet names */
const SH = {
  BOOKINGS     : 'Bookings',
  EVENTS       : 'Events',
  CONFIG       : 'Config',
  MANUAL_BLOCKS: 'ManualBlocks',
  LOG          : 'Log',
};

/** Booking status values */
const STATUS = {
  HOLD               : 'HOLD',
  PAYMENT_SUBMITTED  : 'PAYMENT_SUBMITTED',
  CONFIRMED          : 'CONFIRMED',
  REJECTED           : 'REJECTED',
  EXPIRED            : 'EXPIRED',
  CANCELLED          : 'CANCELLED',
};

/** Statuses that block availability */
const BLOCKING_STATUSES = [STATUS.HOLD, STATUS.PAYMENT_SUBMITTED, STATUS.CONFIRMED];

/** Bookings column index map (0-based) */
const BC = {
  bookingId    : 0,
  createdAt    : 1,
  name         : 2,
  phone        : 3,
  email        : 4,
  guests       : 5,
  checkIn      : 6,   // stored as YYYY-MM-DD string
  checkOut     : 7,   // stored as YYYY-MM-DD string
  nights       : 8,
  amount       : 9,   // amount the guest pays online (advance or full total)
  status       : 10,
  holdExpiresAt: 11,
  utr          : 12,
  confirmedAt  : 13,
  notes        : 14,
  telegramMsgId: 15,  // extra column – Telegram message ID for editing
  package      : 16,  // package id: whole | penthouse
  total        : 17,  // full stay price (amount + balance paid at the resort)
};

/** Events column index map (0-based) */
const EC = {
  eventId  : 0,
  createdAt: 1,
  name     : 2,
  phone    : 3,
  email    : 4,
  eventType: 5,
  eventDate: 6,
  guests   : 7,
  notes    : 8,
  status   : 9,
};

/**
 * Stay packages (id → default display name).
 * Prices live in the Config sheet as <id>_weekdayRate, <id>_weekendRate,
 * <id>_advance, <id>_maxGuests and optionally <id>_name.
 */
const PACKAGES = {
  whole    : 'Whole Resort',
  penthouse: 'Penthouse + Pool, Turf & Garden',
};

// ─────────────────────────────────────────────────────────────────────────────
// Spreadsheet helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Sheet "${name}" not found. Run setupSheets() first.`);
  return sh;
}

function sheetData(name) {
  const sh = getSheet(name);
  const vals = sh.getDataRange().getValues();
  return { sh, rows: vals.slice(1), header: vals[0] }; // skip header row
}

// ─────────────────────────────────────────────────────────────────────────────
// Config helper – reads the Config sheet once and caches in memory per call
// ─────────────────────────────────────────────────────────────────────────────

function getConfig() {
  const { rows } = sheetData(SH.CONFIG);
  const cfg = {};
  rows.forEach(r => { if (r[0]) cfg[r[0]] = r[1]; });
  return cfg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Package helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Positive number or 0 (blank cells, text and negatives become 0) */
function toNum(v) {
  const n = Number(v);
  return n > 0 ? n : 0;
}

/**
 * Returns the live settings for a package id, or null if the id is unknown.
 * Whole Resort falls back to the original weekdayRate / weekendRate keys so
 * existing Config sheets keep working. Other packages have no fallback: a
 * blank rate means "not priced yet" and quotes/bookings for it are refused.
 */
function getPackage(id, cfg) {
  if (!Object.prototype.hasOwnProperty.call(PACKAGES, id)) return null;
  const legacy      = id === 'whole';
  const weekdayRate = toNum(cfg[id + '_weekdayRate']) || (legacy ? toNum(cfg.weekdayRate) : 0);
  const weekendRate = toNum(cfg[id + '_weekendRate']) || (legacy ? toNum(cfg.weekendRate) : 0) || weekdayRate;
  return {
    id,
    name     : cfg[id + '_name'] || PACKAGES[id],
    weekdayRate,
    weekendRate,
    advance  : toNum(cfg[id + '_advance']),
    maxGuests: toNum(cfg[id + '_maxGuests']) || toNum(cfg.maxGuests) || 100,
  };
}

/**
 * Picks the package for a quote/booking request.
 * Requests without a package are treated as Whole Resort (old behaviour).
 * Returns { pkg } or { error, code }.
 */
function resolvePackage(id, cfg) {
  const pkgId = String(id || 'whole').trim().toLowerCase();
  const pkg   = getPackage(pkgId, cfg);
  if (!pkg) return { error: `package must be one of: ${Object.keys(PACKAGES).join(', ')}`, code: 'INVALID_PACKAGE' };
  if (!pkg.weekdayRate) return { error: `Prices for ${pkg.name} are not set yet. Please contact us.`, code: 'PRICE_NOT_SET' };
  return { pkg };
}

/** Display name for a booking row's package column */
function packageName(id) {
  return PACKAGES[id] || id || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Script Properties (secrets)
// ─────────────────────────────────────────────────────────────────────────────

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Unique ID generator
// ─────────────────────────────────────────────────────────────────────────────

function genId(prefix) {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON response builder (ContentService)
// ─────────────────────────────────────────────────────────────────────────────

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message, code: code || 'ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// Log to the Log sheet
// ─────────────────────────────────────────────────────────────────────────────

function logEntry(level, action, detail) {
  try {
    const sh = getSheet(SH.LOG);
    sh.appendRow([new Date(), level, action, detail]);
  } catch(e) {
    console.error('logEntry failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (all dates are plain YYYY-MM-DD strings; no timezone ambiguity)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string into a UTC midnight Date */
function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Format a Date to YYYY-MM-DD (UTC) */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD strings */
function nightsBetween(checkIn, checkOut) {
  return (parseDate(checkOut) - parseDate(checkIn)) / 86400000;
}

/** Returns true if a night starting on dateStr (YYYY-MM-DD) is Fri or Sat */
function isWeekendNight(dateStr) {
  const d = parseDate(dateStr);
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  return dow === 5 || dow === 6; // Fri=5, Sat=6
}

/** Enumerate every date in [checkIn, checkOut) as YYYY-MM-DD strings */
function enumerateNights(checkIn, checkOut) {
  const nights = [];
  const cur = parseDate(checkIn);
  const end = parseDate(checkOut);
  while (cur < end) {
    nights.push(fmtDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return nights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Price calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns { nights, breakdown: [{date, rate}], total } for one package.
 * Never trusts client-supplied price.
 */
function calculateQuote(checkIn, checkOut, pkg) {
  const nightDates  = enumerateNights(checkIn, checkOut);
  let total = 0;
  const breakdown = nightDates.map(d => {
    const rate = isWeekendNight(d) ? pkg.weekendRate : pkg.weekdayRate;
    total += rate;
    return { date: d, rate };
  });
  return { nights: nightDates.length, breakdown, total };
}

/**
 * Splits a quote into what is paid online now and what is paid at the resort.
 * Config chargeAdvanceOnly = 'true' charges only the package advance online;
 * anything else (the default) charges the full total online, as before.
 */
function paymentSplit(total, pkg, cfg) {
  const advanceOnly = String(cfg.chargeAdvanceOnly).toLowerCase() === 'true' && pkg.advance > 0;
  const advance     = advanceOnly ? Math.min(pkg.advance, total) : total;
  return { total, advance, balance: total - advance };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 – SHEET BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run once from the Apps Script editor.
 * Creates all required sheets with headers and populates default Config values.
 * Safe to re-run: existing sheets and existing Config keys are never changed,
 * only missing Config keys are added.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetDefs = [
    {
      name   : SH.BOOKINGS,
      headers: [
        'bookingId','createdAt','name','phone','email','guests',
        'checkIn','checkOut','nights','amount','status',
        'holdExpiresAt','utr','confirmedAt','notes','telegramMsgId',
        'package','total'
      ]
    },
    {
      name   : SH.EVENTS,
      headers: ['eventId','createdAt','name','phone','email','eventType','eventDate','guests','notes','status']
    },
    {
      name   : SH.CONFIG,
      headers: ['key','value','description']
    },
    {
      name   : SH.MANUAL_BLOCKS,
      headers: ['blockId','blockDate','reason','createdAt']
    },
    {
      name   : SH.LOG,
      headers: ['timestamp','level','action','detail']
    },
  ];

  sheetDefs.forEach(def => {
    let sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.appendRow(def.headers);
      sh.setFrozenRows(1);
      // Force plain text on date/value columns so Sheets never auto-converts
      // YYYY-MM-DD strings to Date objects (which would silently break overlap checks)
      // or 'true'/'false' strings to booleans (which would break notifyOnNewHold).
      if (def.name === SH.BOOKINGS)      sh.getRange('G:H').setNumberFormat('@');
      if (def.name === SH.EVENTS)        sh.getRange('G:G').setNumberFormat('@');
      if (def.name === SH.MANUAL_BLOCKS) sh.getRange('B:B').setNumberFormat('@');
      if (def.name === SH.CONFIG)        sh.getRange('B:B').setNumberFormat('@');
      // Bold + color the header
      sh.getRange(1, 1, 1, def.headers.length)
        .setFontWeight('bold')
        .setBackground('#1a73e8')
        .setFontColor('#ffffff');
      Logger.log(`Created sheet: ${def.name}`);
    } else {
      Logger.log(`Sheet already exists, skipping: ${def.name}`);
    }
  });

  ensureBookingColumns();

  // Populate default Config rows
  const configDefaults = [
    ['weekdayRate',                '5000',         'Nightly rate Mon–Thu (INR)'],
    ['weekendRate',                '7000',         'Nightly rate Fri & Sat (INR)'],
    ['minNights',                  '2',            'Minimum nights per booking'],
    ['maxGuests',                  '100',          'Maximum guests per booking'],
    ['holdMinutesBeforePayment',   '20',           'Minutes a HOLD is valid before UTR submission'],
    ['holdMinutesAfterPaymentSubmitted', '360',    'Minutes hold is extended after UTR submitted'],
    ['upiId',                      'nsgresort@upi','UPI VPA for payments'],
    ['payeeName',                  'NSG Royal Resort','Payee name shown in UPI app'],
    ['resortName',                 'NSG Royal Resort','Resort name used in emails/messages'],
    ['notifyOnNewHold',            'false',        'true = send Telegram alert on every new HOLD'],
    ['timezone',                   'Asia/Kolkata', 'Resort timezone (informational)'],
    // Per-package prices. Left blank on purpose: fill them in the Config sheet.
    // Blank Whole Resort rates fall back to weekdayRate / weekendRate above.
    ['whole_weekdayRate',          '',             'Whole Resort nightly rate Sun–Thu (INR). Blank = use weekdayRate'],
    ['whole_weekendRate',          '',             'Whole Resort nightly rate Fri & Sat (INR). Blank = use weekendRate'],
    ['whole_advance',              '',             'Whole Resort advance (INR)'],
    ['whole_maxGuests',            '',             'Whole Resort max guests. Blank = use maxGuests'],
    ['penthouse_weekdayRate',      '',             'Penthouse nightly rate Sun–Thu (INR). Blank = not bookable online'],
    ['penthouse_weekendRate',      '',             'Penthouse nightly rate Fri & Sat (INR). Blank = same as weekday'],
    ['penthouse_advance',          '',             'Penthouse advance (INR)'],
    ['penthouse_maxGuests',        '',             'Penthouse max guests. Blank = use maxGuests'],
    ['chargeAdvanceOnly',          'false',        'true = guest pays only the package advance online, balance at the resort'],
  ];

  const cfgSheet = ss.getSheetByName(SH.CONFIG);
  const existingKeys = cfgSheet.getDataRange().getValues().slice(1).map(r => r[0]);

  configDefaults.forEach(([key, value, desc]) => {
    if (!existingKeys.includes(key)) {
      cfgSheet.appendRow([key, value, desc]);
      Logger.log(`Config added: ${key} = ${value}`);
    }
  });

  Logger.log('setupSheets() complete.');
  SpreadsheetApp.flush();
}

/** Adds the 'package' and 'total' headers to an existing Bookings sheet if missing */
function ensureBookingColumns() {
  const sh = getSheet(SH.BOOKINGS);
  if (sh.getRange(1, BC.package + 1).getValue() !== 'package') {
    sh.getRange(1, BC.package + 1, 1, 2).setValues([['package', 'total']]);
  }
}

/**
 * Installs a 5-minute time-driven trigger for expireHolds().
 * Safe to run multiple times – won't duplicate triggers.
 */
function installTriggers() {
  const FUNCTION_NAME = 'expireHolds';

  // Remove any existing trigger for this function first
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === FUNCTION_NAME)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(FUNCTION_NAME)
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log(`Trigger installed: ${FUNCTION_NAME} every 5 minutes.`);
}

/**
 * Registers the Telegram webhook pointing at this web app.
 * Requires Script Properties:
 *   BOT_TOKEN       – Telegram bot token from BotFather
 *   WEBHOOK_SECRET  – random string appended as ?key= for authentication
 *   WEB_APP_URL     – deployed web app URL
 */
function setWebhook() {
  const token  = prop('BOT_TOKEN');
  const secret = prop('WEBHOOK_SECRET');
  const webUrl = prop('WEB_APP_URL');

  if (!token || !secret || !webUrl) {
    throw new Error('Missing Script Properties: BOT_TOKEN, WEBHOOK_SECRET, or WEB_APP_URL');
  }

  const webhookUrl = `${webUrl}?source=telegram&key=${encodeURIComponent(secret)}`;
  const apiUrl     = `https://api.telegram.org/bot${token}/setWebhook`;

  const resp = UrlFetchApp.fetch(apiUrl, {
    method : 'post',
    payload: JSON.stringify({ url: webhookUrl, allowed_updates: ['callback_query'] }),
    contentType: 'application/json',
    muteHttpExceptions: true,
  });

  const result = JSON.parse(resp.getContentText());
  Logger.log('setWebhook result: ' + JSON.stringify(result));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 – HTTP ROUTER
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || '';
    switch (action) {
      case 'info'        : return handleInfo();
      case 'availability': return handleAvailability(e.parameter);
      case 'quote'       : return handleQuote(e.parameter);
      default            : return jsonErr('Unknown GET action. Use: info | availability | quote', 'UNKNOWN_ACTION');
    }
  } catch (err) {
    logEntry('ERROR', 'doGet', err.message);
    return jsonErr('Internal server error: ' + err.message, 'SERVER_ERROR');
  }
}

function doPost(e) {
  try {
    // ── Telegram webhook path ──────────────────────────────────────────────
    const params = e.parameter || {};
    if (params.source === 'telegram') {
      const webhookSecret = prop('WEBHOOK_SECRET');
      if (!webhookSecret || params.key !== webhookSecret) {
        return jsonErr('Forbidden', 'FORBIDDEN');
      }
      const body = JSON.parse(e.postData.contents || '{}');
      return handleTelegramWebhook(body);
    }

    // ── Regular API path ───────────────────────────────────────────────────
    // Frontend must POST with Content-Type: text/plain and JSON as the body
    let body = {};
    try {
      body = JSON.parse(e.postData.contents || '{}');
    } catch (_) {
      return jsonErr('Request body must be valid JSON', 'BAD_JSON');
    }

    const action = body.action || params.action || '';
    switch (action) {
      case 'createBooking' : return handleCreateBooking(body);
      case 'submitPayment' : return handleSubmitPayment(body);
      case 'eventEnquiry'  : return handleEventEnquiry(body);
      default              : return jsonErr('Unknown POST action. Use: createBooking | submitPayment | eventEnquiry', 'UNKNOWN_ACTION');
    }
  } catch (err) {
    logEntry('ERROR', 'doPost', err.message);
    return jsonErr('Internal server error: ' + err.message, 'SERVER_ERROR');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 – ACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// ── 4a. info ─────────────────────────────────────────────────────────────────

/**
 * GET action=info
 * Public resort info and live package prices for the website's package cards.
 * A package with weekdayRate 0 has no price set yet (the site shows "Price on request").
 */
function handleInfo() {
  const cfg = getConfig();
  return jsonOk({
    resortName: cfg.resortName || 'NSG Royal Resort',
    minNights : Number(cfg.minNights) || 2,
    maxGuests : Number(cfg.maxGuests) || 100,
    packages  : Object.keys(PACKAGES).map(id => getPackage(id, cfg)),
  });
}

// ── 4b. availability ─────────────────────────────────────────────────────────

/**
 * GET action=availability&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns all blocked dates in the range plus current rates.
 */
function handleAvailability(params) {
  const from = params.from;
  const to   = params.to;

  if (!isValidDate(from)) return jsonErr('Invalid "from" date', 'INVALID_DATE');
  if (!isValidDate(to))   return jsonErr('Invalid "to" date',   'INVALID_DATE');
  if (parseDate(from) >= parseDate(to)) return jsonErr('"from" must be before "to"', 'INVALID_RANGE');

  const blocked = getBlockedDates(from, to);
  const cfg     = getConfig();

  return jsonOk({
    blockedDates: blocked,
    weekdayRate : Number(cfg.weekdayRate) || 5000,
    weekendRate : Number(cfg.weekendRate) || 7000,
    minNights   : Number(cfg.minNights)   || 2,
    maxGuests   : Number(cfg.maxGuests)   || 100,
  });
}

/**
 * Returns array of YYYY-MM-DD strings that are blocked within [from, to).
 * Considers: active booking statuses + ManualBlocks + expired holds treated as free.
 */
/** Turns a Sheet cell (text OR real date) into a YYYY-MM-DD string */
function cellDateStr(v) {
  if (v instanceof Date) {
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}
function getBlockedDates(from, to) {
  const now        = new Date();
  const fromDate   = parseDate(from);
  const toDate     = parseDate(to);
  const blockedSet = new Set();

  // ── Bookings ──
  const { rows: bookingRows } = sheetData(SH.BOOKINGS);
  bookingRows.forEach(row => {
    const status       = row[BC.status];
    const holdExpires  = row[BC.holdExpiresAt] ? new Date(row[BC.holdExpiresAt]) : null;

    if (!BLOCKING_STATUSES.includes(status)) return;

    // For HOLD: skip if expired
    if (status === STATUS.HOLD && holdExpires && holdExpires < now) return;

       const bIn  = parseDate(cellDateStr(row[BC.checkIn]));
       const bOut = parseDate(cellDateStr(row[BC.checkOut]));
    if (!bIn || !bOut) return;

    // Overlap with [fromDate, toDate)
    if (bIn < toDate && bOut > fromDate) {
      const cur = new Date(Math.max(bIn.getTime(), fromDate.getTime()));
      const end = new Date(Math.min(bOut.getTime(), toDate.getTime()));
      while (cur < end) {
        blockedSet.add(fmtDate(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
  });

  // ── Manual blocks ──
  const { rows: manualRows } = sheetData(SH.MANUAL_BLOCKS);
  manualRows.forEach(row => {
       const d = parseDate(cellDateStr(row[1]));
    if (d && d >= fromDate && d < toDate) blockedSet.add(fmtDate(d));
  });

  return Array.from(blockedSet).sort();
}

// ── 4c. quote ────────────────────────────────────────────────────────────────

/**
 * GET action=quote&package=whole|penthouse&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=N
 * Returns { nights, breakdown, total, advance, balance, package }.
 */
function handleQuote(params) {
  const checkIn  = params.checkIn;
  const checkOut = params.checkOut;
  const guests   = parseInt(params.guests, 10);

  const cfg = getConfig();
  const sel = resolvePackage(params.package, cfg);
  if (sel.error) return jsonErr(sel.error, sel.code);

  const val = validateBookingInput({ checkIn, checkOut, guests }, cfg, sel.pkg.maxGuests);
  if (val.error) return jsonErr(val.error, val.code);

  const quote = calculateQuote(checkIn, checkOut, sel.pkg);
  return jsonOk({ ...quote, ...paymentSplit(quote.total, sel.pkg, cfg), package: sel.pkg.id });
}

// ── 4d. createBooking ────────────────────────────────────────────────────────
function fixDateColumns() {
  getSheet(SH.BOOKINGS).getRange('G:H').setNumberFormat('@');
  getSheet(SH.EVENTS).getRange('G:G').setNumberFormat('@');
  getSheet(SH.MANUAL_BLOCKS).getRange('B:B').setNumberFormat('@');
  getSheet(SH.CONFIG).getRange('B:B').setNumberFormat('@');
}
/**
 * POST { action, package, name, phone, email, guests, checkIn, checkOut, notes, _hp }
 * _hp is a honeypot field – must be blank.
 */
function handleCreateBooking(body) {
  // Honeypot check
  if (body._hp && body._hp.trim() !== '') {
    logEntry('WARN', 'createBooking', 'Honeypot triggered, IP not available in Apps Script');
    return jsonErr('Invalid request', 'HONEYPOT');
  }

  const cfg = getConfig();

  // Package and its prices
  const sel = resolvePackage(body.package, cfg);
  if (sel.error) return jsonErr(sel.error, sel.code);
  const pkg = sel.pkg;

  // Validate core fields
  const val = validateBookingInput(body, cfg, pkg.maxGuests);
  if (val.error) return jsonErr(val.error, val.code);

  // Validate personal details
  const nameVal  = sanitiseString(body.name, 100);
  if (!nameVal)  return jsonErr('Name is required', 'MISSING_NAME');

  const phoneVal = sanitisePhone(body.phone);
  if (!phoneVal) return jsonErr('Invalid Indian mobile number (10 digits, starting 6-9)', 'INVALID_PHONE');

  const emailVal = body.email ? sanitiseEmail(body.email) : '';
  if (body.email && !emailVal) return jsonErr('Invalid email address', 'INVALID_EMAIL');

  const notesVal = sanitiseString(body.notes, 500) || '';

  // Rate limit: max 3 holds per phone per hour
  if (!checkRateLimit(phoneVal)) {
    return jsonErr('Too many bookings attempted from this number. Please wait and try again.', 'RATE_LIMITED');
  }

  // Acquire script lock to prevent double-booking
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // wait up to 10 s

    // Re-check availability inside the lock
    const blocked = getBlockedDates(body.checkIn, body.checkOut);
    const nights  = enumerateNights(body.checkIn, body.checkOut);
    const conflict = nights.some(n => blocked.includes(n));
    if (conflict) {
      return jsonErr('Those dates are no longer available. Please choose different dates.', 'DATES_UNAVAILABLE');
    }

    // Compute price server-side
    const quote     = calculateQuote(body.checkIn, body.checkOut, pkg);
    const pay       = paymentSplit(quote.total, pkg, cfg);
    const holdMins  = Number(cfg.holdMinutesBeforePayment) || 20;
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + holdMins * 60000);

    const bookingId = genId('BK');

    // Write to Bookings sheet
    ensureBookingColumns();
    const sh = getSheet(SH.BOOKINGS);
    sh.appendRow([
      bookingId,
      now.toISOString(),
      nameVal,
      phoneVal,
      emailVal,
      Number(body.guests),
      body.checkIn,
      body.checkOut,
      quote.nights,
      pay.advance,  // amount paid online
      STATUS.HOLD,
      expiresAt.toISOString(),
      '',   // utr
      '',   // confirmedAt
      notesVal,
      '',   // telegramMsgId
      pkg.id,
      pay.total,
    ]);
    SpreadsheetApp.flush();

    logEntry('INFO', 'createBooking', `${bookingId} HOLD ${pkg.id} for ${phoneVal} ${body.checkIn}→${body.checkOut}`);

    // Optional: Telegram alert on new HOLD
    if (cfg.notifyOnNewHold === 'true') {
      const msg = `🏨 *New HOLD* – ${cfg.resortName}\n`
        + `📋 ID: \`${bookingId}\`\n`
        + `🏡 ${pkg.name}\n`
        + `👤 ${nameVal} | 📞 ${phoneVal}\n`
        + `📅 ${body.checkIn} → ${body.checkOut} (${quote.nights} nights)\n`
        + `💰 ₹${pay.advance.toLocaleString('en-IN')} online`
        + (pay.balance ? ` + ₹${pay.balance.toLocaleString('en-IN')} at resort` : '') + `\n`
        + `⏳ Hold expires: ${expiresAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
      telegramSend(msg, null); // no buttons at HOLD stage
    }

    // Build UPI deep link for the amount paid online
    const upiLink = buildUpiLink(cfg.upiId, cfg.payeeName, pay.advance, bookingId);

    return jsonOk({
      bookingId,
      package     : pkg.id,
      amount      : pay.advance,
      total       : pay.total,
      balance     : pay.balance,
      nights      : quote.nights,
      breakdown   : quote.breakdown,
      holdExpiresAt: expiresAt.toISOString(),
      upiLink,
      message     : `Booking hold placed. Complete payment within ${holdMins} minutes.`,
    });

  } catch (err) {
    if (err.message && err.message.includes('Could not obtain lock')) {
      return jsonErr('Server busy, please retry in a moment.', 'LOCK_TIMEOUT');
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ── 4e. submitPayment ────────────────────────────────────────────────────────

/**
 * POST { action, bookingId, utr }
 * Validates UTR loosely (alphanumeric, 12-22 chars), marks PAYMENT_SUBMITTED,
 * sends Telegram alert with Confirm/Reject inline buttons.
 */
function handleSubmitPayment(body) {
  const bookingId = sanitiseString(body.bookingId, 50);
  const utr       = sanitiseString(body.utr, 30);

  if (!bookingId) return jsonErr('bookingId is required', 'MISSING_FIELD');
  if (!utr)       return jsonErr('UTR/transaction reference is required', 'MISSING_FIELD');
  if (!isValidUtr(utr)) return jsonErr('Invalid UTR format. Should be 8-22 alphanumeric characters.', 'INVALID_UTR');

  const sh    = getSheet(SH.BOOKINGS);
  const rows  = sh.getDataRange().getValues();
  const rowIdx = rows.findIndex((r, i) => i > 0 && r[BC.bookingId] === bookingId);

  if (rowIdx < 0) return jsonErr('Booking not found', 'NOT_FOUND');

  const row    = rows[rowIdx];
  const status = row[BC.status];
  const now    = new Date();

  if (status === STATUS.PAYMENT_SUBMITTED) {
    return jsonErr('Payment already submitted for this booking.', 'ALREADY_SUBMITTED');
  }
  if (status !== STATUS.HOLD) {
    return jsonErr(`Cannot submit payment for booking in status: ${status}`, 'INVALID_STATUS');
  }

  // Check hold hasn't expired
  const holdExpires = row[BC.holdExpiresAt] ? new Date(row[BC.holdExpiresAt]) : null;
  if (holdExpires && holdExpires < now) {
    // Mark as expired
    sh.getRange(rowIdx + 1, BC.status + 1).setValue(STATUS.EXPIRED);
    SpreadsheetApp.flush();
    return jsonErr('Your hold has expired. Please start a new booking.', 'HOLD_EXPIRED');
  }

  const cfg        = getConfig();
  const extendMins = Number(cfg.holdMinutesAfterPaymentSubmitted) || 360;
  const newExpiry  = new Date(now.getTime() + extendMins * 60000);

  // Update row
  const dataRow = rowIdx + 1; // 1-indexed
  sh.getRange(dataRow, BC.status       + 1).setValue(STATUS.PAYMENT_SUBMITTED);
  sh.getRange(dataRow, BC.holdExpiresAt + 1).setValue(newExpiry.toISOString());
  sh.getRange(dataRow, BC.utr          + 1).setValue(utr);
  SpreadsheetApp.flush();

  logEntry('INFO', 'submitPayment', `${bookingId} UTR=${utr}`);

  // Build Telegram alert
  const name     = row[BC.name];
  const phone    = row[BC.phone];
  const checkIn  = row[BC.checkIn];
  const checkOut = row[BC.checkOut];
  const nights   = row[BC.nights];
  const amount   = row[BC.amount];
  const guests   = row[BC.guests];
  const notes    = row[BC.notes];
  const resortName = cfg.resortName || 'NSG Royal Resort';

  const msg = `💳 *Payment Submitted* – ${resortName}\n\n`
    + `📋 Booking ID: \`${bookingId}\`\n`
    + (row[BC.package] ? `🏡 Package: ${packageName(row[BC.package])}\n` : '')
    + `👤 Name   : ${name}\n`
    + `📞 Phone  : ${phone}\n`
    + `📅 Dates  : ${checkIn} → ${checkOut} (${nights} nights)\n`
    + `👥 Guests : ${guests}\n`
    + `💰 Amount : ₹${Number(amount).toLocaleString('en-IN')}\n`
    + balanceLine(row)
    + `🔖 UTR    : \`${utr}\`\n`
    + (notes ? `📝 Notes  : ${notes}\n` : '')
    + `\n⏳ Auto-expires: ${newExpiry.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Confirm', callback_data: `confirm:${bookingId}` },
      { text: '❌ Reject',  callback_data: `reject:${bookingId}`  },
    ]]
  };

  const sentMsg = telegramSend(msg, keyboard);
  if (sentMsg && sentMsg.result && sentMsg.result.message_id) {
    sh.getRange(dataRow, BC.telegramMsgId + 1).setValue(sentMsg.result.message_id);
    SpreadsheetApp.flush();
  }

  return jsonOk({
    message: 'Payment reference received. Staff will verify and confirm shortly.',
    bookingId,
  });
}

/** "Balance at resort" line for Telegram, only when the guest paid an advance */
function balanceLine(row) {
  const balance = Number(row[BC.total]) - Number(row[BC.amount]);
  return balance > 0 ? `🧾 Balance: ₹${balance.toLocaleString('en-IN')} at the resort\n` : '';
}

// ── 4f. eventEnquiry ─────────────────────────────────────────────────────────

/**
 * POST { action, name, phone, email, eventType, eventDate, guests, notes }
 * Event types: wedding, birthday, corporate, getaway, other
 */
function handleEventEnquiry(body) {
  const nameVal  = sanitiseString(body.name, 100);
  if (!nameVal)  return jsonErr('Name is required', 'MISSING_NAME');

  const phoneVal = sanitisePhone(body.phone);
  if (!phoneVal) return jsonErr('Invalid Indian mobile number', 'INVALID_PHONE');

  const emailVal    = body.email ? sanitiseEmail(body.email) : '';
  if (body.email && !emailVal) return jsonErr('Invalid email', 'INVALID_EMAIL');

  const validTypes  = ['wedding','birthday','corporate','getaway','other'];
  const eventType   = sanitiseString(body.eventType, 30);
  if (!validTypes.includes(eventType)) {
    return jsonErr(`eventType must be one of: ${validTypes.join(', ')}`, 'INVALID_EVENT_TYPE');
  }

  const eventDate = sanitiseString(body.eventDate, 10);
  if (eventDate && !isValidDate(eventDate)) return jsonErr('Invalid eventDate', 'INVALID_DATE');

  const guests    = parseInt(body.guests, 10) || 0;
  const notesVal  = sanitiseString(body.notes, 1000) || '';
  const eventId   = genId('EV');
  const now       = new Date();

  // Write to Events sheet
  const sh = getSheet(SH.EVENTS);
  sh.appendRow([
    eventId, now.toISOString(), nameVal, phoneVal, emailVal,
    eventType, eventDate, guests, notesVal, 'NEW'
  ]);
  SpreadsheetApp.flush();

  logEntry('INFO', 'eventEnquiry', `${eventId} ${eventType} from ${phoneVal}`);

  // Telegram alert (no buttons for events)
  const cfg = getConfig();
  const msg = `🎉 *Event Enquiry* – ${cfg.resortName || 'NSG Royal Resort'}\n\n`
    + `📋 ID     : \`${eventId}\`\n`
    + `👤 Name   : ${nameVal}\n`
    + `📞 Phone  : ${phoneVal}\n`
    + (emailVal ? `📧 Email  : ${emailVal}\n` : '')
    + `🎊 Type   : ${eventType}\n`
    + (eventDate ? `📅 Date   : ${eventDate}\n` : '')
    + `👥 Guests : ${guests}\n`
    + (notesVal ? `📝 Notes  : ${notesVal}\n` : '');

  telegramSend(msg, null);

  return jsonOk({
    eventId,
    message: 'Enquiry received! Our team will contact you within 24 hours.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 – TELEGRAM WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point for all incoming Telegram updates.
 * Only handles callback_query (button presses).
 */
function handleTelegramWebhook(update) {
  if (!update.callback_query) {
    // Could be a message update – ignore
    return ContentService.createTextOutput('ok');
  }

  const query    = update.callback_query;
  const chatId   = String(query.message.chat.id);
  const msgId    = query.message.message_id;
  const data     = query.data || '';
  const from     = query.from;
  const staffName = (from.first_name || '') + (from.last_name ? ' ' + from.last_name : '') || 'Staff';

  // Validate: only allowed chat IDs may confirm/reject
  const allowedChats = prop('ALLOWED_CHAT_IDS').split(',').map(s => s.trim());
  if (!allowedChats.includes(chatId)) {
    answerCallbackQuery(query.id, '⛔ You are not authorised to manage bookings.');
    logEntry('WARN', 'telegramWebhook', `Unauthorised chatId: ${chatId}`);
    return ContentService.createTextOutput('ok');
  }

  const [action, bookingId] = data.split(':');

  if (action === 'confirm') {
    processConfirm(bookingId, chatId, msgId, query.id, staffName);
  } else if (action === 'reject') {
    processReject(bookingId, chatId, msgId, query.id, staffName);
  } else {
    answerCallbackQuery(query.id, 'Unknown action.');
  }

  return ContentService.createTextOutput('ok');
}

// ── Confirm booking ───────────────────────────────────────────────────────────

function processConfirm(bookingId, chatId, msgId, callbackQueryId, staffName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sh   = getSheet(SH.BOOKINGS);
    const rows = sh.getDataRange().getValues();
    const idx  = rows.findIndex((r, i) => i > 0 && r[BC.bookingId] === bookingId);

    if (idx < 0) {
      answerCallbackQuery(callbackQueryId, '❌ Booking not found.');
      return;
    }

    const row    = rows[idx];
    const status = row[BC.status];
    const now    = new Date();

    // Idempotency
    if (status === STATUS.CONFIRMED) {
      answerCallbackQuery(callbackQueryId, '✅ Already confirmed.');
      editTelegramMessageLabel(chatId, msgId, rows[idx], `✅ Already confirmed by ${escapeMarkdown(staffName)}`);
      return;
    }

    if (![STATUS.HOLD, STATUS.PAYMENT_SUBMITTED].includes(status)) {
      answerCallbackQuery(callbackQueryId, `⚠️ Cannot confirm – status is ${status}.`);
      return;
    }

    // Update to CONFIRMED
    const dataRow = idx + 1;
    sh.getRange(dataRow, BC.status      + 1).setValue(STATUS.CONFIRMED);
    sh.getRange(dataRow, BC.confirmedAt + 1).setValue(now.toISOString());
    // Clear expiry – dates are now permanently blocked
    sh.getRange(dataRow, BC.holdExpiresAt + 1).setValue('');
    SpreadsheetApp.flush();

    logEntry('INFO', 'confirm', `${bookingId} confirmed by ${staffName}`);

    // Send guest confirmation email
    const email = row[BC.email];
    if (email) {
      sendGuestEmail(row, getConfig());
    }

    // WhatsApp stub
    sendGuestWhatsApp(row[BC.phone],
      `Your booking at NSG Royal Resort (ID: ${bookingId}) is CONFIRMED! Check-in: ${row[BC.checkIn]}, Check-out: ${row[BC.checkOut]}.`);

    // Edit Telegram message to show outcome
    const label = `✅ *CONFIRMED* by ${escapeMarkdown(staffName)} at ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    editTelegramMessageLabel(chatId, msgId, row, label);
    answerCallbackQuery(callbackQueryId, '✅ Booking confirmed! Guest email sent.');

  } finally {
    lock.releaseLock();
  }
}

// ── Reject booking ────────────────────────────────────────────────────────────

function processReject(bookingId, chatId, msgId, callbackQueryId, staffName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sh   = getSheet(SH.BOOKINGS);
    const rows = sh.getDataRange().getValues();
    const idx  = rows.findIndex((r, i) => i > 0 && r[BC.bookingId] === bookingId);

    if (idx < 0) {
      answerCallbackQuery(callbackQueryId, '❌ Booking not found.');
      return;
    }

    const row    = rows[idx];
    const status = row[BC.status];
    const now    = new Date();

    // Idempotency
    if (status === STATUS.REJECTED) {
      answerCallbackQuery(callbackQueryId, '❌ Already rejected.');
      return;
    }

    if (status === STATUS.CONFIRMED) {
      answerCallbackQuery(callbackQueryId, '⚠️ Booking is already confirmed. Cannot reject.');
      return;
    }

    // Update to REJECTED – dates are freed automatically (no longer blocking)
    const dataRow = idx + 1;
    sh.getRange(dataRow, BC.status       + 1).setValue(STATUS.REJECTED);
    sh.getRange(dataRow, BC.holdExpiresAt + 1).setValue('');
    SpreadsheetApp.flush();

    logEntry('INFO', 'reject', `${bookingId} rejected by ${staffName}`);

    const label = `❌ *REJECTED* by ${escapeMarkdown(staffName)} at ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    editTelegramMessageLabel(chatId, msgId, row, label);
    answerCallbackQuery(callbackQueryId, '❌ Booking rejected. Dates are now free.');

  } finally {
    lock.releaseLock();
  }
}

// ── Edit the Telegram message to show outcome ─────────────────────────────────

function editTelegramMessageLabel(chatId, msgId, row, label) {
  const resortName = getConfig().resortName || 'NSG Royal Resort';
  const bookingId  = row[BC.bookingId];
  const name       = row[BC.name];
  const phone      = row[BC.phone];
  const checkIn    = row[BC.checkIn];
  const checkOut   = row[BC.checkOut];
  const nights     = row[BC.nights];
  const amount     = row[BC.amount];
  const utr        = row[BC.utr];
  const guests     = row[BC.guests];
  const notes      = row[BC.notes];

  const newText = `💳 *Payment Submitted* – ${resortName}\n\n`
    + `📋 Booking ID: \`${bookingId}\`\n`
    + (row[BC.package] ? `🏡 Package: ${packageName(row[BC.package])}\n` : '')
    + `👤 Name   : ${name}\n`
    + `📞 Phone  : ${phone}\n`
    + `📅 Dates  : ${checkIn} → ${checkOut} (${nights} nights)\n`
    + `👥 Guests : ${guests}\n`
    + `💰 Amount : ₹${Number(amount).toLocaleString('en-IN')}\n`
    + balanceLine(row)
    + (utr   ? `🔖 UTR    : \`${utr}\`\n`  : '')
    + (notes ? `📝 Notes  : ${notes}\n` : '')
    + `\n${label}`;

  editMessageText(chatId, msgId, newText);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 – TELEGRAM API WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

function telegramApiCall(method, payload) {
  const token = prop('BOT_TOKEN');
  if (!token) {
    logEntry('ERROR', 'telegram', 'BOT_TOKEN not set in Script Properties');
    return null;
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const resp = UrlFetchApp.fetch(url, {
      method           : 'post',
      contentType      : 'application/json',
      payload          : JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const result = JSON.parse(resp.getContentText());
    if (!result.ok) {
      logEntry('WARN', 'telegramApi', `${method} failed: ${JSON.stringify(result)}`);
    }
    return result;
  } catch (err) {
    logEntry('ERROR', 'telegramApi', `${method} threw: ${err.message}`);
    return null;
  }
}

/**
 * Sends a message to all ALLOWED_CHAT_IDs.
 * @param {string} text    MarkdownV2-compatible text
 * @param {object|null} replyMarkup  Inline keyboard or null
 * @returns the last API response (for message_id)
 */
function telegramSend(text, replyMarkup) {
  const chatIds = prop('ALLOWED_CHAT_IDS').split(',').map(s => s.trim()).filter(Boolean);
  let lastResp  = null;
  chatIds.forEach(chatId => {
    const payload = {
      chat_id   : chatId,
      text      : text,
      parse_mode: 'Markdown',
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    lastResp = telegramApiCall('sendMessage', payload);
  });
  return lastResp;
}

function editMessageText(chatId, messageId, text) {
  return telegramApiCall('editMessageText', {
    chat_id   : chatId,
    message_id: messageId,
    text      : text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [] }, // removes buttons
  });
}

function answerCallbackQuery(callbackQueryId, text) {
  return telegramApiCall('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text             : text,
    show_alert       : false,
  });
}

/** Escape special chars for Telegram MarkdownV2 (used only in label strings) */
function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, c => '\\' + c);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 – EMAIL & WHATSAPP STUB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a booking confirmation email to the guest.
 * Requires the guest's email address.
 */
function sendGuestEmail(row, cfg) {
  const email      = row[BC.email];
  const name       = row[BC.name];
  const bookingId  = row[BC.bookingId];
  const checkIn    = row[BC.checkIn];
  const checkOut   = row[BC.checkOut];
  const nights     = row[BC.nights];
  const amount     = row[BC.amount];
  const guests     = row[BC.guests];
  const balance    = Number(row[BC.total]) - Number(amount);
  const resortName = cfg.resortName || 'NSG Royal Resort';

  const subject = `Booking Confirmed – ${resortName} | ${bookingId}`;
  const body    = `Dear ${name},\n\n`
    + `Your booking at ${resortName} has been CONFIRMED! 🎉\n\n`
    + `━━━━━━━━━━━━━━━━━━━━━━━━\n`
    + `Booking ID : ${bookingId}\n`
    + (row[BC.package] ? `Package    : ${packageName(row[BC.package])}\n` : '')
    + `Check-in   : ${checkIn}\n`
    + `Check-out  : ${checkOut}\n`
    + `Nights     : ${nights}\n`
    + `Guests     : ${guests}\n`
    + `Amount Paid: ₹${Number(amount).toLocaleString('en-IN')}\n`
    + (balance > 0 ? `Balance    : ₹${balance.toLocaleString('en-IN')} (pay at the resort)\n` : '')
    + `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    + `Resort Address: Bheemili Beach Road, Bheemili, Andhra Pradesh, India\n\n`
    + `Please show this email at check-in.\n\n`
    + `For any queries call us or reply to this email.\n\n`
    + `Warm regards,\n${resortName} Team`;

  try {
    MailApp.sendEmail(email, subject, body);
    logEntry('INFO', 'sendGuestEmail', `Sent to ${email} for ${bookingId}`);
  } catch (err) {
    logEntry('ERROR', 'sendGuestEmail', `Failed for ${bookingId}: ${err.message}`);
  }
}

/**
 * WhatsApp stub – currently logs only.
 * Replace the body with a real API call (e.g., Interakt, Wati, or Meta Cloud API).
 * @param {string} phone  Indian mobile (no country code, 10 digits)
 * @param {string} text   Message text
 */
function sendGuestWhatsApp(phone, text) {
  // TODO: plug in WhatsApp Business API provider here
  logEntry('INFO', 'sendGuestWhatsApp', `STUB – To: +91${phone} | Message: ${text}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 – HOLD EXPIRY (time-driven trigger)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs every 5 minutes (installed by installTriggers()).
 * Marks all stale HOLD and PAYMENT_SUBMITTED rows as EXPIRED.
 */
function expireHolds() {
  const sh   = getSheet(SH.BOOKINGS);
  const rows = sh.getDataRange().getValues();
  const now  = new Date();
  let count  = 0;

  rows.forEach((row, i) => {
    if (i === 0) return; // skip header
    const status  = row[BC.status];
    if (![STATUS.HOLD, STATUS.PAYMENT_SUBMITTED].includes(status)) return;

    const expires = row[BC.holdExpiresAt] ? new Date(row[BC.holdExpiresAt]) : null;
    if (!expires || expires > now) return;

    // Expire it
    sh.getRange(i + 1, BC.status + 1).setValue(STATUS.EXPIRED);
    logEntry('INFO', 'expireHolds', `${row[BC.bookingId]} expired (was ${status})`);
    count++;
  });

  if (count > 0) SpreadsheetApp.flush();
  Logger.log(`expireHolds: marked ${count} booking(s) as EXPIRED.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 – VALIDATION & SANITISATION
// ─────────────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD format + valid calendar date */
function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = parseDate(str);
  if (!d) return false;
  // Verify no date overflow (e.g., 2024-02-30)
  return fmtDate(d) === str;
}

/**
 * Validates all date/guest constraints for booking and quote.
 * maxGuestsOverride is the selected package's limit (falls back to Config maxGuests).
 * Returns { error, code } or {} if valid.
 */
function validateBookingInput(body, cfg, maxGuestsOverride) {
  const checkIn  = body.checkIn;
  const checkOut = body.checkOut;
  const guests   = parseInt(body.guests, 10);

  if (!isValidDate(checkIn))  return { error: 'Invalid checkIn date', code: 'INVALID_DATE' };
  if (!isValidDate(checkOut)) return { error: 'Invalid checkOut date', code: 'INVALID_DATE' };

  const today = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  ));
  if (parseDate(checkIn) < today) return { error: 'Check-in date cannot be in the past', code: 'PAST_DATE' };
  if (parseDate(checkOut) <= parseDate(checkIn)) return { error: 'Check-out must be after check-in', code: 'INVALID_RANGE' };

  const nights    = nightsBetween(checkIn, checkOut);
  const minNights = Number(cfg.minNights) || 2;
  if (nights < minNights) return { error: `Minimum stay is ${minNights} nights`, code: 'MIN_NIGHTS' };

  if (isNaN(guests) || guests < 1) return { error: 'Number of guests must be at least 1', code: 'INVALID_GUESTS' };
  const maxGuests = maxGuestsOverride || Number(cfg.maxGuests) || 100;
  if (guests > maxGuests) return { error: `Maximum ${maxGuests} guests allowed`, code: 'MAX_GUESTS' };

  return {}; // no error
}

/** Strip / limit a string; returns null if empty after trim */
function sanitiseString(val, maxLen) {
  if (val == null) return null;
  const s = String(val).trim().slice(0, maxLen);
  return s || null;
}

/** Validates and normalises a 10-digit Indian mobile number */
function sanitisePhone(val) {
  if (!val) return null;
  let d = String(val).replace(/\D/g, '');
  // Strip country code / trunk prefix only when the length shows it is there
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Basic email sanity check */
function sanitiseEmail(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Loose UTR validation: 8-22 alphanumeric characters.
 * Real UPI UTRs are 12 digits from bank transfers; IMPS/UPI refs vary.
 */
function isValidUtr(utr) {
  return /^[A-Za-z0-9]{8,22}$/.test(utr);
}

/**
 * Simple in-memory rate limiter backed by the Script cache.
 * Allows up to 3 HOLD attempts per phone number per hour.
 */
function checkRateLimit(phone) {
  const cache  = CacheService.getScriptCache();
  const key    = 'rl_' + phone;
  const stored = cache.get(key);
  const count  = stored ? parseInt(stored, 10) : 0;
  if (count >= 3) return false; // too many
  cache.put(key, String(count + 1), 3600); // 1-hour window
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPI Deep Link
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a upi://pay deep link that auto-fills UPI apps.
 * @param {string} upiId      e.g. nsgresort@upi
 * @param {string} payeeName  e.g. NSG Royal Resort
 * @param {number} amount     INR amount (integer)
 * @param {string} bookingId  Used as transaction note / reference
 */
function buildUpiLink(upiId, payeeName, amount, bookingId) {
  const params = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    `am=${amount}`,
    `cu=INR`,
    `tn=${encodeURIComponent('Booking ' + bookingId)}`,
    `tr=${encodeURIComponent(bookingId)}`,
  ];
  return 'upi://pay?' + params.join('&');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 – TEST FUNCTIONS (run from the Apps Script editor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logs what action=info returns: check both packages show the right prices.
 */
function testInfo() {
  Logger.log('testInfo: ' + handleInfo().getContent());
}

/**
 * Logs a 2-night weekday quote for each package, two weeks from today.
 */
function testQuotes() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); // next Monday
  const checkIn  = fmtDate(d);
  d.setUTCDate(d.getUTCDate() + 2);
  const checkOut = fmtDate(d);
  Object.keys(PACKAGES).forEach(id => {
    const r = handleQuote({ package: id, checkIn, checkOut, guests: '2' });
    Logger.log(`testQuotes ${id}: ${r.getContent()}`);
  });
}

/**
 * Simulates a full booking flow: createBooking + submitPayment.
 * Check the Bookings sheet and Telegram for results.
 */
function testCreateBooking() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfter = new Date();
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 3);

  const body = {
    action   : 'createBooking',
    package  : 'whole',
    name     : 'Test Guest',
    phone    : '9876543210',
    email    : 'test@example.com',
    guests   : 4,
    checkIn  : fmtDate(tomorrow),
    checkOut : fmtDate(dayAfter),
    notes    : 'Test booking from testCreateBooking()',
    _hp      : '', // honeypot empty
  };

  const result = handleCreateBooking(body);
  Logger.log('testCreateBooking result: ' + result.getContent());

  // Now submit payment
  const data = JSON.parse(result.getContent());
  if (data.ok && data.bookingId) {
    const payResult = handleSubmitPayment({
      action   : 'submitPayment',
      bookingId: data.bookingId,
      utr      : 'TEST12345678',
    });
    Logger.log('testSubmitPayment result: ' + payResult.getContent());
  }
}

/**
 * Verifies that a second booking for overlapping dates is rejected.
 */
function testOverlapRejected() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 5);
  const dayAfter = new Date();
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 7);

  const body = {
    action  : 'createBooking',
    package : 'whole',
    name    : 'Overlap Test',
    phone   : '9123456780',
    email   : '',
    guests  : 2,
    checkIn : fmtDate(tomorrow),
    checkOut: fmtDate(dayAfter),
    notes   : '',
    _hp     : '',
  };

  // First booking should succeed
  const r1 = handleCreateBooking(body);
  Logger.log('Overlap test – first booking: ' + r1.getContent());

  // Second booking for same dates should fail
  body.phone = '9123456781'; // different phone to bypass rate limit
  const r2 = handleCreateBooking(body);
  Logger.log('Overlap test – second booking (should fail): ' + r2.getContent());
}

/**
 * Manually triggers expireHolds() – useful for testing expiry logic.
 */
function testExpireHolds() {
  expireHolds();
  Logger.log('testExpireHolds complete. Check Log sheet.');
}

/**
 * Sends a test message to all configured Telegram chat IDs.
 */
function testTelegramPing() {
  const result = telegramSend('🏨 *NSG Royal Resort Backend* – ping test ✅\nSetup is working correctly.', null);
  Logger.log('testTelegramPing: ' + JSON.stringify(result));
}
