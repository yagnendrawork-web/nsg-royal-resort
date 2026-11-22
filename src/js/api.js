/**
 * NSG ROYAL RESORT — API CLIENT & NORMALISER
 * api.js: Only file that knows raw response shapes (SPEC Section 7 & 9, docs/api.md)
 * Methods: getInfo, getAvailability, getQuote, addons, cars, createBooking, submitPayment, getBooking, eventEnquiry, reviews
 * Pay-link and staff actions (getByToken, staffLogin … staffResendMessage) live in api.link.js,
 * loaded only by pay.html and staff.html so the Home JS budget is untouched.
 */

window.NSG = window.NSG || {};

(function () {
  'use strict';

  function getConfig() {
    return (window.NSG && window.NSG.CONFIG) || { USE_MOCK: true, API_URL: '' };
  }

  // 8-second request timeout helper — every fetch is aborted after 8s
  function fetchWithTimeout(input, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init ? Object.assign({}, init, { signal: controller.signal }) : { signal: controller.signal };
    return fetch(input, signal).then(function (res) {
      clearTimeout(timeoutId);
      return res;
    }, function (err) {
      clearTimeout(timeoutId);
      throw err;
    });
  }

  function getErrorMessage(code) {
    const ui = (window.NSG && window.NSG.UI) || {};
    const errors = ui.errors || {};
    return errors[code] || errors.GENERIC_ERROR || 'An unexpected error occurred. Please contact us on WhatsApp.';
  }

  // -------------------------------------------------------------------------
  // Date Helpers (UTC-safe math)
  // -------------------------------------------------------------------------
  function parseDateStr(str) {
    const parts = str.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function formatDateStr(date) {
    return date.toISOString().split('T')[0];
  }

  function getTodayKolkataStr() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return formatDateStr(now);
  }

  function addDays(dateStr, days) {
    const d = parseDateStr(dateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return formatDateStr(d);
  }

  /* MOCK:START */
  // -------------------------------------------------------------------------
  // Mock Storage (localStorage under nsg_mock_*)
  // -------------------------------------------------------------------------
  const MOCK_STORAGE_KEY_BOOKINGS = 'nsg_mock_bookings';

  function getMockBookings() {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY_BOOKINGS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    // Seed default confirmed booking and sample bookings
    const today = getTodayKolkataStr();
    const seeded = {
      'BK-DEMO-0001': {
        bookingId: 'BK-DEMO-0001',
        phone: '9999991234',
        name: 'Demo Guest',
        email: 'demo@example.com',
        bookingType: 'stay',
        packageId: 'whole',
        packageName: MOCK_INFO.packages[0].name,
        checkIn: addDays(today, 15),
        checkOut: addDays(today, 18),
        nights: 3,
        guests: 10,
        amount: 10000,
        total: 130000,
        balance: 120000,
        status: 'CONFIRMED',
        confirmedAt: new Date(Date.now() - 86400000).toISOString(),
        utr: 'UTR9876543210'
      }
    };
    saveMockBookings(seeded);
    return seeded;
  }

  function saveMockBookings(bookings) {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY_BOOKINGS, JSON.stringify(bookings));
    } catch (e) {}
  }

  // Mock manual blocks (staff can block/unblock them in mock mode): a 2-night block (+4, +5),
  // a single night between free days (+9) and a 3-night block (+18, +19, +20)
  const MOCK_STORAGE_KEY_BLOCKS = 'nsg_mock_blocks';
  function getMockBlocks() {
    try {
      const v = JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY_BLOCKS));
      if (Array.isArray(v)) return v;
    } catch (e) {}
    const today = getTodayKolkataStr();
    return [4, 5, 9, 18, 19, 20].map((n) => ({ date: addDays(today, n), reason: 'Mock block', addedBy: '' }));
  }
  function saveMockBlocks(list) {
    try { localStorage.setItem(MOCK_STORAGE_KEY_BLOCKS, JSON.stringify(list)); } catch (e) {}
  }

  // Blocked nights = manual blocks + nights of active bookings
  function getSeedBlockedNights() {
    const blocked = new Set(getMockBlocks().map((b) => b.date));

    // Also include active bookings from mock storage
    const bookings = getMockBookings();
    Object.values(bookings).forEach((b) => {
      if (b.status === 'HOLD' || b.status === 'PAYMENT_SUBMITTED' || b.status === 'CONFIRMED') {
        const start = parseDateStr(b.checkIn);
        const end = parseDateStr(b.checkOut);
        const curr = new Date(start);
        while (curr < end) {
          blocked.add(formatDateStr(curr));
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      }
    });

    return Array.from(blocked).sort();
  }

  const MOCK_INFO = {
    resortName: 'NSG Royal Resort',
    address: 'Nidigattu, Bheemunipatnam, Bheemili',
    checkInTime: '11:00',
    checkOutTime: '10:00',
    minNights: 2,
    cancellationPolicy: 'Free cancellation up to 48 hours before check-in.',
    // MOCK packages (backend seed shape). Names, guest limits (20 / 16 / 4) and features are MOCK until the live API sends them.
    packages: [
      {
        id: 'whole', name: 'Entire Resort (MOCK)', subtitle: 'Whole property · 4 Bedrooms', order: 1,
        bedrooms: 4, bathrooms: 4, maxGuests: 20, weekdayRate: 25000, weekendRate: 28000, advance: 10000,
        extraGuestFee: 500, maxExtraGuests: 5, popular: false,
        includes: ['bedrooms', 'lounge', 'penthouse-lounge', 'terrace', 'kitchen', 'bar', 'home-theatre', 'pool', 'turf', 'garden', 'wifi', 'parking'], excludes: []
      },
      {
        id: 'ground', name: 'Ground Floor (MOCK)', subtitle: 'Ground Floor · 3 Bedrooms', order: 2,
        bedrooms: 3, bathrooms: 3, maxGuests: 16, weekdayRate: 13000, weekendRate: 15000, advance: 2000,
        extraGuestFee: 500, maxExtraGuests: 4, popular: true,
        includes: ['bedrooms', 'lounge', 'pool', 'turf', 'garden', 'wifi', 'parking'], excludes: ['kitchen', 'bar', 'home-theatre']
      },
      {
        id: 'penthouse', name: 'Penthouse (MOCK)', subtitle: 'Rooftop · 1 Bedroom', order: 3,
        bedrooms: 1, bathrooms: 1, maxGuests: 4, weekdayRate: 10000, weekendRate: 12000, advance: 5000,
        extraGuestFee: 500, maxExtraGuests: 2, popular: false,
        includes: ['bedrooms', 'penthouse-lounge', 'terrace', 'kitchen', 'bar', 'home-theatre', 'pool', 'turf', 'garden', 'wifi', 'parking'], excludes: ['lounge']
      }
    ],
    eventTypes: [
      { id: 'wedding', name: 'Wedding / Reception', advance: 10000 },
      { id: 'birthday', name: 'Birthday / Private Party', advance: 5000 },
      { id: 'corporate', name: 'Corporate Gathering', advance: 5000 },
      { id: 'other', name: 'Other Celebration', advance: 2000 }
    ]
  };

  // Mock add-ons: one per unit type (USE_MOCK only)
  const MOCK_ADDONS = [
    { id: 'mock-dinner', category: 'food', name: 'Mock dinner package', description: 'Mock item for testing.', unit: 'per_guest', price: 400, maxQty: 10, confirmRequired: true, slot: '', details: '' },
    { id: 'mock-pickup', category: 'travel', name: 'Mock station pickup', description: 'Mock item for testing.', unit: 'flat', price: 1500, maxQty: 10, confirmRequired: false, slot: '', details: '' },
    { id: 'mock-car', category: 'car', name: 'Mock self-drive car', description: 'Mock item for testing.', unit: 'per_night', price: 3000, maxQty: 10, confirmRequired: true, slot: '', details: '' },
    { id: 'mock-cake', category: 'food', name: 'Mock celebration cake', description: 'Mock item for testing.', unit: 'per_qty', price: 800, maxQty: 4, confirmRequired: false, slot: '', details: '' },
    { id: 'food-biryani', category: 'food', name: 'Mock Biryani package', description: 'Mock item for testing.', unit: 'per_qty', price: 250, minQty: 8, maxQty: 100, confirmRequired: true, slot: 'food-biryani', details: '' },
    { id: 'food-starters', category: 'food', name: 'Mock Starters package', description: 'Mock item for testing.', unit: 'per_qty', price: 250, minQty: 8, maxQty: 100, confirmRequired: true, slot: 'food-starters', details: '' },
    { id: 'food-desserts', category: 'food', name: 'Mock Desserts package', description: 'Mock item for testing.', unit: 'per_qty', price: 250, minQty: 8, maxQty: 100, confirmRequired: true, slot: 'food-desserts', details: '' }
  ];

  /* MOCK:END */
  function normaliseAddon(a) {
    a = a || {};
    const price = a.price === null || a.price === undefined || a.price === '' ? null : Number(a.price);
    return {
      id: String(a.id || ''),
      category: String(a.category || 'other').toLowerCase(),
      name: String(a.name || ''),
      description: String(a.description || ''),
      unit: String(a.unit || 'flat'),
      price: price !== null && isFinite(price) ? price : null,
      maxQty: Number(a.maxQty) > 0 ? Number(a.maxQty) : 10,
      minQty: Number(a.minQty) >= 1 ? Math.floor(Number(a.minQty)) : 1,
      confirmRequired: a.confirmRequired === true || String(a.confirmRequired).toLowerCase() === 'true',
      slot: String(a.slot || ''),
      details: String(a.details || '')
    };
  }

  function normaliseAddonLines(lines) {
    return (Array.isArray(lines) ? lines : []).map((l) => ({
      id: String(l.id || ''),
      name: String(l.name || ''),
      qty: Number(l.qty) || 1,
      unitPrice: Number(l.unitPrice) || 0,
      lineTotal: Number(l.lineTotal) || 0,
      confirmRequired: !!l.confirmRequired
    }));
  }

  function upiIdFromLink(link) {
    const m = /[?&]pa=([^&]+)/.exec(String(link || ''));
    try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
  }

  // [{id, qty}] -> "id:qty,id:qty" for GET quote
  function addonsParam(addons) {
    return (Array.isArray(addons) ? addons : [])
      .filter((a) => a && a.id)
      .map((a) => encodeURIComponent(a.id) + ':' + (Number(a.qty) || 1))
      .join(',');
  }

  /* MOCK:START */
  // Mock-mode pricing that mirrors the server rules (docs/api.md, GET addons)
  function mockPriceAddons(addons, guests, nights) {
    const merged = {};
    const order = [];
    (Array.isArray(addons) ? addons : []).forEach((a) => {
      if (!a || !a.id) return;
      if (!(a.id in merged)) { merged[a.id] = 0; order.push(a.id); }
      merged[a.id] += Number(a.qty) || 1;
    });
    const lines = [];
    let total = 0;
    for (let i = 0; i < order.length; i++) {
      const item = MOCK_ADDONS.find((m) => m.id === order[i]);
      if (!item || item.price === null) return { error: true };
      let qty = 1;
      let mult = 1;
      if (item.unit === 'per_qty') {
        qty = merged[item.id];
        if (qty < (item.minQty || 1) || qty > item.maxQty) return { error: true };
        mult = qty;
      } else if (item.unit === 'per_guest') {
        mult = Number(guests) || 1;
      } else if (item.unit === 'per_night') {
        mult = nights;
      }
      const lineTotal = item.price * mult;
      lines.push({ id: item.id, name: item.name, qty: qty, unitPrice: item.price, lineTotal: lineTotal, confirmRequired: item.confirmRequired });
      total += lineTotal;
    }
    return { lines: lines, total: total };
  }
  /* MOCK:END */

  // -------------------------------------------------------------------------
  // 1. GET info
  // -------------------------------------------------------------------------
  // Shared by every caller on a page; a failed result is not cached so a later call retries.
  // Apps Script takes seconds per call, so the last good info is kept in localStorage (12 h) and returned at once,
  // while a fresh copy is always fetched; infoChanged() resolves with it only if it differs. Display only: quotes
  // and bookings are always priced live by the server.
  const INFO_KEY = 'nsg_info';
  let infoPromise = null;
  let infoChangedPromise = null;
  function readCachedInfo(config) {
    try {
      const c = JSON.parse(localStorage.getItem(INFO_KEY));
      if (c && c.url === config.API_URL && Date.now() - c.at < 12 * 3600e3 && c.data && c.data.packages && c.data.packages.length) return c.data;
    } catch (e) {}
    return null;
  }
  function getInfo() {
    if (infoPromise) return infoPromise;
    const config = getConfig();
    const cached = config.USE_MOCK ? null : readCachedInfo(config);
    const fresh = loadInfo().then(function (r) {
      if (r.ok && !config.USE_MOCK) {
        try { localStorage.setItem(INFO_KEY, JSON.stringify({ at: Date.now(), url: config.API_URL, data: r.data })); } catch (e) {}
      }
      if (!r.ok && !cached) infoPromise = null;
      return r;
    });
    infoChangedPromise = cached
      ? fresh.then((r) => (r.ok && JSON.stringify(r.data) !== JSON.stringify(cached) ? r.data : null))
      : Promise.resolve(null);
    infoPromise = cached ? Promise.resolve({ ok: true, data: cached, cached: true }) : fresh;
    return infoPromise;
  }
  // Fresh info when it differs from the cached copy getInfo() returned; null when nothing changed
  function infoChanged() {
    if (!infoChangedPromise) getInfo();
    return infoChangedPromise;
  }

  function toAmount(v) {
    const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
    return n > 0 ? n : 0;
  }

  // includes[] / excludes[]: array or comma text of ids or { id, label }; ids lower-case with dashes, common spellings merged
  const FEATURE_ALIASES = { 'wi-fi': 'wifi', 'home-theater': 'home-theatre', 'theatre': 'home-theatre', 'gardens': 'garden', 'swimming-pool': 'pool', 'cricket-turf': 'turf', 'bedroom': 'bedrooms', 'living-room': 'lounge' };
  function normaliseFeatures(raw) {
    return (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((f) => {
      const obj = f && typeof f === 'object';
      const label = String((obj ? f.label || f.name || f.id : f) || '').trim();
      const id = String((obj ? f.id || label : f) || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
      return id ? { id: FEATURE_ALIASES[id] || id, label: label } : null;
    }).filter(Boolean);
  }

  // Accepts packages as an array or as an object keyed by id. Fields added later (subtitle, includes, excludes,
  // bedrooms, bathrooms, extraGuestFee, maxExtraGuests, popular, order) are optional, so the older response still works.
  function normalisePackages(raw) {
    const list = Array.isArray(raw) ? raw : Object.keys(raw || {}).map((k) => Object.assign({ id: k }, raw[k]));
    return list.map((p, i) => {
      const fee = toAmount(p.extraGuestFee);
      const order = Number(p.order);
      return {
        id: String(p.id || p.packageId || '').trim().toLowerCase(),
        name: p.name || p.title || '',
        subtitle: String(p.subtitle || '').trim(),
        description: String(p.description || '').trim(),
        weekdayRate: toAmount(p.weekdayRate ?? p.weekday ?? p.rateWeekday),
        weekendRate: toAmount(p.weekendRate ?? p.weekend ?? p.rateWeekend),
        advance: toAmount(p.advance ?? p.advanceAmount ?? p.deposit),
        maxGuests: toAmount(p.maxGuests ?? p.capacity ?? p.guests),
        bedrooms: toAmount(p.bedrooms) || null,
        bathrooms: toAmount(p.bathrooms) || null,
        extraGuestFee: fee,
        maxExtraGuests: fee ? toAmount(p.maxExtraGuests) : 0,
        popular: p.popular === true || String(p.popular).toLowerCase() === 'true',
        includes: normaliseFeatures(p.includes),
        excludes: normaliseFeatures(p.excludes),
        order: p.order !== '' && p.order != null && isFinite(order) ? order : 1e6 + i
      };
    }).sort((a, b) => a.order - b.order);
  }

  async function loadInfo() {
    const config = getConfig();
    /* MOCK:START */
    if (config.USE_MOCK) {
      return { ok: true, data: Object.assign({}, MOCK_INFO, { packages: normalisePackages(MOCK_INFO.packages) }) };
    }
    /* MOCK:END */

    try {
      const url = `${config.API_URL}?action=info`;
      // Apps Script cold starts can be slow: 15s timeout, one retry on network failure
      let json;
      for (let attempt = 0; attempt < 2 && !json; attempt++) {
        try {
          const res = await fetchWithTimeout(url, undefined, 15000);
          json = await res.json();
        } catch (err) {
          json = undefined;
        }
      }
      if (!json) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code || 'NETWORK', error: getErrorMessage(json.code || 'NETWORK') };
      }
      return {
        ok: true,
        data: {
          resortName: json.resortName || json.data?.resortName || 'NSG Royal Resort',
          address: json.address || json.data?.address,
          checkInTime: json.checkInTime || json.data?.checkInTime || '11:00',
          checkOutTime: json.checkOutTime || json.data?.checkOutTime || '10:00',
          minNights: json.minNights || json.data?.minNights || 2,
          cancellationPolicy: json.cancellationPolicy || json.data?.cancellationPolicy,
          packages: normalisePackages(json.packages || json.data?.packages),
          eventTypes: json.eventTypes || json.data?.eventTypes || []
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 2. GET availability (from, to)
  // -------------------------------------------------------------------------
  async function getAvailability(from, to) {
    const config = getConfig();
    /* MOCK:START */
    if (config.USE_MOCK) {
      const allBlocked = getSeedBlockedNights();
      const filtered = allBlocked.filter((d) => (!from || d >= from) && (!to || d <= to));
      return { ok: true, data: filtered };
    }
    /* MOCK:END */

    try {
      const url = `${config.API_URL}?action=availability&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      let res;
      try {
        res = await fetchWithTimeout(url, undefined, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code || 'NETWORK', error: getErrorMessage(json.code || 'NETWORK') };
      }
      return {
        ok: true,
        data: json.blockedDates || json.blockedNights || json.data?.blockedDates || []
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 3. GET quote (packageId, checkIn, checkOut, guests)
  // -------------------------------------------------------------------------
  async function getQuote(packageId, checkIn, checkOut, guests, addons) {
    const config = getConfig();
    /* MOCK:START */
    if (config.USE_MOCK) {
      const pkg = MOCK_INFO.packages.find((p) => p.id === packageId) || MOCK_INFO.packages[0];
      const start = parseDateStr(checkIn);
      const end = parseDateStr(checkOut);
      const diffMs = end.getTime() - start.getTime();
      const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

      const breakdown = [];
      let total = 0;
      const curr = new Date(start);

      for (let i = 0; i < nights; i++) {
        const dayOfWeek = curr.getUTCDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Fri or Sat
        const rate = isWeekend ? pkg.weekendRate : pkg.weekdayRate;
        const kind = isWeekend ? 'weekend' : 'weekday';

        breakdown.push({
          date: formatDateStr(curr),
          rate: rate,
          kind: kind
        });
        total += rate;
        curr.setUTCDate(curr.getUTCDate() + 1);
      }

      const advance = pkg.advance;
      const extraGuests = Math.max(0, (Number(guests) || 1) - pkg.maxGuests);
      if (extraGuests > (pkg.extraGuestFee ? pkg.maxExtraGuests : 0)) return { ok: false, code: 'MAX_GUESTS', error: getErrorMessage('MAX_GUESTS') };
      const extraGuestsTotal = extraGuests * pkg.extraGuestFee * nights;
      const priced = mockPriceAddons(addons, guests, nights);
      if (priced.error) return { ok: false, code: 'INVALID_ADDON', error: getErrorMessage('INVALID_ADDON') };
      const baseTotal = total;
      total = baseTotal + extraGuestsTotal + priced.total;
      const balance = Math.max(0, total - advance);

      return {
        ok: true,
        data: {
          packageId: pkg.id,
          nights: nights,
          breakdown: breakdown,
          baseTotal: baseTotal,
          extraGuests: extraGuests,
          extraGuestFee: pkg.extraGuestFee,
          extraGuestsTotal: extraGuestsTotal,
          addonsBreakdown: priced.lines,
          addonsTotal: priced.total,
          total: total,
          advance: advance,
          balance: balance,
          available: true,
          minNights: MOCK_INFO.minNights,
          maxGuests: pkg.maxGuests
        }
      };
    }
    /* MOCK:END */

    try {
      const addonsQuery = addonsParam(addons);
      const url = `${config.API_URL}?action=quote&package=${encodeURIComponent(packageId)}&checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${encodeURIComponent(guests)}` + (addonsQuery ? `&addons=${addonsQuery}` : '');
      let res;
      try {
        res = await fetchWithTimeout(url, undefined, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code || 'NETWORK', error: getErrorMessage(json.code || 'NETWORK'), detail: json.error || '' };
      }
      return {
        ok: true,
        data: {
          nights: json.nights || json.data?.nights,
          breakdown: json.breakdown || json.data?.breakdown || [],
          baseTotal: Number(json.baseTotal ?? json.data?.baseTotal ?? json.total ?? 0),
          // extraGuests is { count, fee, nights, total, label } or null (docs/api.md, Extra guests)
          extraGuests: Number(json.extraGuests?.count) || 0,
          extraGuestFee: Number(json.extraGuests?.fee) || 0,
          extraGuestsTotal: Number(json.extraGuestsTotal ?? json.extraGuests?.total) || 0,
          extraGuestsLabel: String(json.extraGuests?.label || ''),
          addonsBreakdown: normaliseAddonLines(json.addonsBreakdown || json.data?.addonsBreakdown),
          addonsTotal: Number(json.addonsTotal ?? json.data?.addonsTotal ?? 0),
          total: json.total || json.data?.total || 0,
          advance: json.advance || json.data?.advance || 0,
          balance: json.balance || json.data?.balance || 0,
          available: json.available !== undefined ? json.available : true,
          minNights: json.minNights || json.data?.minNights || 2,
          maxGuests: json.maxGuests || json.data?.maxGuests || 100
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 5. POST createBooking
  // -------------------------------------------------------------------------
  async function createBooking(payload) {
    const config = getConfig();

    // Normalise phone number: strip spaces, dashes, +91, leading 0
    let cleanPhone = String(payload.phone || '').trim().replace(/[\s\-]/g, '');
    if (cleanPhone.startsWith('+91')) cleanPhone = cleanPhone.slice(3);
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = cleanPhone.slice(1);

    /* MOCK:START */
    if (config.USE_MOCK) {
      // Honeypot check
      if (payload._hp && String(payload._hp).trim() !== '') {
        return { ok: false, code: 'HONEYPOT', error: getErrorMessage('HONEYPOT') };
      }

      // Rate limit test check: phone ending 0000 -> RATE_LIMITED
      if (cleanPhone.endsWith('0000')) {
        return { ok: false, code: 'RATE_LIMITED', error: getErrorMessage('RATE_LIMITED') };
      }

      // Phone validation
      if (!/^\d{10}$/.test(cleanPhone)) {
        return { ok: false, code: 'INVALID_PHONE', error: getErrorMessage('INVALID_PHONE') };
      }

      // Name validation
      if (!payload.name || String(payload.name).trim() === '') {
        return { ok: false, code: 'MISSING_NAME', error: getErrorMessage('MISSING_NAME') };
      }

      const isEvent = payload.bookingType === 'event';
      const pkg = MOCK_INFO.packages.find((p) => p.id === payload.package) || MOCK_INFO.packages[0];
      const guestsCount = Number(payload.guests) || 1;

      // Guests validation against package max
      if (!isEvent && guestsCount > pkg.maxGuests + (pkg.extraGuestFee ? pkg.maxExtraGuests : 0)) {
        return { ok: false, code: 'MAX_GUESTS', error: getErrorMessage('MAX_GUESTS') };
      }

      // Date validations
      const todayStr = getTodayKolkataStr();
      if (payload.checkIn < todayStr) {
        return { ok: false, code: 'PAST_DATE', error: getErrorMessage('PAST_DATE') };
      }
      if (payload.checkOut <= payload.checkIn) {
        return { ok: false, code: 'INVALID_RANGE', error: getErrorMessage('INVALID_RANGE') };
      }

      // Check date availability
      const blockedSet = new Set(getSeedBlockedNights());
      const start = parseDateStr(payload.checkIn);
      const end = parseDateStr(payload.checkOut);
      const curr = new Date(start);
      let nightCount = 0;
      while (curr < end) {
        nightCount++;
        const dStr = formatDateStr(curr);
        if (blockedSet.has(dStr)) {
          return { ok: false, code: 'DATES_UNAVAILABLE', error: getErrorMessage('DATES_UNAVAILABLE') };
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }

      // Minimum nights validation for stay
      if (!isEvent && nightCount < MOCK_INFO.minNights) {
        return { ok: false, code: 'MIN_NIGHTS', error: getErrorMessage('MIN_NIGHTS') };
      }

      // Calculate rates
      let advance = pkg.advance;
      let total = 0;
      if (isEvent) {
        const evType = MOCK_INFO.eventTypes.find((e) => e.id === payload.eventType) || MOCK_INFO.eventTypes[0];
        advance = evType.advance;
        total = advance; // base estimate
      } else {
        const quoteRes = await getQuote(pkg.id, payload.checkIn, payload.checkOut, guestsCount);
        total = quoteRes.data.total;
        advance = quoteRes.data.advance;
      }
      const priced = mockPriceAddons(payload.addons, guestsCount, isEvent ? 1 : nightCount);
      if (priced.error) return { ok: false, code: 'INVALID_ADDON', error: getErrorMessage('INVALID_ADDON') };
      const baseTotal = isEvent ? null : total;
      if (!isEvent) total += priced.total;
      const balance = Math.max(0, total - advance);

      // Generate random booking ID: BK-XXXXXX
      const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const bookingId = `BK-${randStr}`;
      const holdExpiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 mins

      const upiId = 'nsgresort@upi';
      const payeeName = 'NSG Royal Resort';
      const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${advance}&cu=INR&tn=Booking+${bookingId}&tr=${bookingId}`;

      const bookingRecord = {
        bookingId: bookingId,
        createdAt: new Date().toISOString(),
        name: payload.name.trim(),
        phone: cleanPhone,
        email: (payload.email || '').trim(),
        bookingType: payload.bookingType || 'stay',
        packageId: isEvent ? null : pkg.id,
        packageName: isEvent ? (payload.eventType || 'Event') : pkg.name,
        eventType: isEvent ? payload.eventType : null,
        guests: guestsCount,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        nights: nightCount,
        amount: advance,
        total: total,
        balance: balance,
        addons: priced.lines,
        addonsTotal: priced.total,
        status: 'HOLD',
        holdExpiresAt: holdExpiresAt,
        notes: (payload.notes || '').trim(),
        utr: null,
        confirmedAt: null
      };

      const allBookings = getMockBookings();
      allBookings[bookingId] = bookingRecord;
      saveMockBookings(allBookings);

      return {
        ok: true,
        data: {
          bookingId: bookingId,
          status: 'HOLD',
          amount: advance,
          total: total,
          balance: balance,
          baseTotal: baseTotal,
          addonsBreakdown: priced.lines,
          addonsTotal: priced.total,
          holdExpiresAt: holdExpiresAt,
          payment: {
            mode: 'upi',
            upiId: upiId,
            payeeName: payeeName,
            upiLink: upiLink,
            note: `Advance payment for Booking ${bookingId}`
          }
        }
      };
    }
    /* MOCK:END */

    try {
      const body = {
        action: 'createBooking',
        name: payload.name,
        phone: cleanPhone,
        email: payload.email || '',
        guests: Number(payload.guests) || 1,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        notes: payload.notes || '',
        _hp: payload._hp || '',
        bookingType: payload.bookingType || 'stay',
        package: payload.package,
        eventType: payload.eventType,
        addons: (Array.isArray(payload.addons) ? payload.addons : []).map((a) => ({ id: a.id, qty: Number(a.qty) || 1 })),
        turnstileToken: payload.turnstileToken || ''
      };

      let res;
      try {
        res = await fetchWithTimeout(config.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(body)
        }, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code, error: getErrorMessage(json.code), detail: json.error || '' };
      }

      const upiLink = json.upiLink || (json.payment && json.payment.upiLink) || '';
      return {
        ok: true,
        data: {
          bookingId: json.bookingId,
          status: 'HOLD',
          amount: json.amount,
          total: json.total || json.amount,
          balance: json.balance || 0,
          baseTotal: json.baseTotal ?? null,
          addonsBreakdown: normaliseAddonLines(json.addonsBreakdown),
          addonsTotal: Number(json.addonsTotal) || 0,
          holdExpiresAt: json.holdExpiresAt,
          payment: {
            mode: (json.payment && json.payment.mode) || 'upi',
            // The backend may send only upiLink; read the payee UPI ID from its pa= parameter
            upiId: (json.payment && json.payment.upiId) || upiIdFromLink(upiLink) || 'nsgresort@upi',
            payeeName: (json.payment && json.payment.payeeName) || 'NSG Royal Resort',
            upiLink: upiLink,
            note: (json.payment && json.payment.note) || `Booking ${json.bookingId}`
          }
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 6. POST submitPayment (ref, utr) — ref is a booking ID (website) or { token } (pay-link page)
  // -------------------------------------------------------------------------
  async function submitPayment(ref, utr) {
    const config = getConfig();
    const cleanUtr = String(utr || '').trim();
    const token = ref && typeof ref === 'object' ? String(ref.token || '') : '';
    const bookingId = ref && typeof ref === 'object' ? String(ref.bookingId || '') : String(ref || '');

    /* MOCK:START */
    if (config.USE_MOCK) {
      // UTR containing "DUP" -> DUPLICATE_UTR
      if (cleanUtr.toUpperCase().includes('DUP')) {
        return { ok: false, code: 'DUPLICATE_UTR', error: getErrorMessage('DUPLICATE_UTR') };
      }

      // Validate UTR format: 8-22 alphanumeric characters
      if (!/^[A-Za-z0-9]{8,22}$/.test(cleanUtr)) {
        return { ok: false, code: 'INVALID_UTR', error: getErrorMessage('INVALID_UTR') };
      }

      const allBookings = getMockBookings();
      const booking = token ? Object.values(allBookings).find((b) => b.linkToken === token) : allBookings[bookingId];
      if (!booking) {
        return { ok: false, code: 'NOT_FOUND', error: getErrorMessage('NOT_FOUND') };
      }
      if (booking.status !== 'HOLD' && booking.status !== 'EXPIRED') {
        return { ok: false, code: 'INVALID_STATUS', error: getErrorMessage('INVALID_STATUS') };
      }

      booking.status = 'PAYMENT_SUBMITTED';
      booking.utr = cleanUtr.toUpperCase();
      // Flips to CONFIRMED 20 seconds later
      booking.autoConfirmAt = Date.now() + 20000;
      saveMockBookings(allBookings);

      return {
        ok: true,
        data: {
          bookingId: booking.bookingId,
          message: 'Payment reference received. Staff will verify and confirm shortly.'
        }
      };
    }
    /* MOCK:END */

    try {
      let res;
      try {
        res = await fetchWithTimeout(config.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(token
            ? { action: 'submitPayment', token: token, utr: cleanUtr }
            : { action: 'submitPayment', bookingId: bookingId, utr: cleanUtr })
        }, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code, error: getErrorMessage(json.code) };
      }
      return {
        ok: true,
        data: {
          bookingId: json.bookingId || bookingId,
          message: json.message || 'Payment reference received.'
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 7. GET getBooking (bookingId, phoneLast4)
  // -------------------------------------------------------------------------
  async function getBooking(bookingId, phoneLast4) {
    const config = getConfig();
    const cleanId = String(bookingId || '').trim();
    const cleanLast4 = String(phoneLast4 || '').trim();

    /* MOCK:START */
    if (config.USE_MOCK) {
      const allBookings = getMockBookings();
      const booking = allBookings[cleanId];
      if (!booking) {
        return { ok: false, code: 'NOT_FOUND', error: getErrorMessage('NOT_FOUND') };
      }

      // Check phoneLast4
      const bPhone = String(booking.phone || '');
      if (cleanLast4 && !bPhone.endsWith(cleanLast4)) {
        return { ok: false, code: 'NOT_FOUND', error: getErrorMessage('NOT_FOUND') };
      }

      // Check if autoConfirmAt timestamp has passed (20s after submitPayment)
      if (booking.status === 'PAYMENT_SUBMITTED' && booking.autoConfirmAt && Date.now() >= booking.autoConfirmAt) {
        booking.status = 'CONFIRMED';
        booking.confirmedAt = new Date().toISOString();
        delete booking.autoConfirmAt;
        saveMockBookings(allBookings);
      }

      return {
        ok: true,
        data: {
          bookingId: booking.bookingId,
          status: booking.status,
          bookingType: booking.bookingType,
          packageId: booking.packageId,
          packageName: booking.packageName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          nights: booking.nights,
          guests: booking.guests,
          name: booking.name,
          amount: booking.amount,
          total: booking.total,
          balance: booking.balance,
          addons: normaliseAddonLines(booking.addons),
          addonsTotal: booking.addonsTotal ?? null,
          confirmedAt: booking.confirmedAt,
          utr: booking.utr
        }
      };
    }
    /* MOCK:END */

    try {
      const url = `${config.API_URL}?action=getBooking&bookingId=${encodeURIComponent(cleanId)}&phoneLast4=${encodeURIComponent(cleanLast4)}`;
      let res;
      try {
        res = await fetchWithTimeout(url, undefined, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code || 'NOT_FOUND', error: getErrorMessage(json.code || 'NOT_FOUND') };
      }
      const b = json.booking || json.data || {};
      return {
        ok: true,
        data: {
          bookingId: b.bookingId || cleanId,
          status: b.status,
          bookingType: b.bookingType || 'stay',
          packageId: b.packageId,
          packageName: b.packageName,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          nights: b.nights,
          guests: b.guests,
          name: b.name,
          amount: b.amount,
          total: b.total,
          balance: b.balance,
          addons: normaliseAddonLines(b.addons),
          addonsTotal: b.addonsTotal === undefined || b.addonsTotal === '' ? null : b.addonsTotal,
          confirmedAt: b.confirmedAt,
          utr: b.utr
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }

  // -------------------------------------------------------------------------
  // 8. POST eventEnquiry (payload)
  // -------------------------------------------------------------------------
  async function eventEnquiry(payload) {
    const config = getConfig();

    let cleanPhone = String(payload.phone || '').trim().replace(/[\s\-]/g, '');
    if (cleanPhone.startsWith('+91')) cleanPhone = cleanPhone.slice(3);
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = cleanPhone.slice(1);

    /* MOCK:START */
    if (config.USE_MOCK) {
      if (!/^\d{10}$/.test(cleanPhone)) {
        return { ok: false, code: 'INVALID_PHONE', error: getErrorMessage('INVALID_PHONE') };
      }
      if (!payload.name || String(payload.name).trim() === '') {
        return { ok: false, code: 'MISSING_NAME', error: getErrorMessage('MISSING_NAME') };
      }

      const eventId = `EV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      return {
        ok: true,
        data: {
          eventId: eventId,
          message: 'Enquiry received! Our team will contact you within 24 hours.'
        }
      };
    }
    /* MOCK:END */

    try {
      let res;
      try {
        res = await fetchWithTimeout(config.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'eventEnquiry',
            name: payload.name,
            phone: cleanPhone,
            email: payload.email || '',
            eventType: payload.eventType,
            eventDate: payload.eventDate || '',
            guests: Number(payload.guests) || 0,
            notes: payload.notes || '',
            turnstileToken: payload.turnstileToken || ''
          })
        }, 8000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code, error: getErrorMessage(json.code) };
      }
      return {
        ok: true,
        data: {
          eventId: json.eventId,
          message: json.message || 'Enquiry received!'
        }
      };
    } catch (err) {
      return { ok: false, code: 'GENERIC_ERROR', error: getErrorMessage('GENERIC_ERROR') };
    }
  }


  // -------------------------------------------------------------------------
  // 9. GET addons (15s timeout, no throw) and cars derived from car add-ons
  // -------------------------------------------------------------------------
  async function addons() {
    const config = getConfig();
    /* MOCK:START */
    if (config.USE_MOCK) {
      return { ok: true, data: MOCK_ADDONS.map(normaliseAddon) };
    }
    /* MOCK:END */
    try {
      let res;
      try {
        res = await fetchWithTimeout(`${config.API_URL}?action=addons`, undefined, 15000);
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
      }
      if (!json.ok) {
        return { ok: false, code: json.code || 'NETWORK', error: getErrorMessage(json.code || 'NETWORK') };
      }
      return { ok: true, data: (json.addons || json.data?.addons || []).map(normaliseAddon) };
    } catch (err) {
      return { ok: false, code: 'NETWORK', error: getErrorMessage('NETWORK') };
    }
  }

  // The backend has no cars action; cars are add-ons with category "car"
  async function cars() {
    const res = await addons();
    if (!res.ok) return res;
    return {
      ok: true,
      data: res.data.filter((a) => a.category === 'car').map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        rateDay: a.price,
        unit: a.unit,
        slot: a.slot,
        details: a.details,
        confirmRequired: a.confirmRequired
      }))
    };
  }

  // -------------------------------------------------------------------------
  // 10. GET reviews (cached in sessionStorage for 10 minutes, no throw)
  // -------------------------------------------------------------------------
  const REVIEWS_KEY = 'nsg_reviews';
  let reviewsPromise = null;

  /* MOCK:START */
  // MOCK only (USE_MOCK, or ?mockreviews=1 for one page view): sample rows, never shown as real reviews
  function mockReviews() {
    const today = getTodayKolkataStr();
    return {
      mock: true, rating: 4.8, count: 120, url: 'https://example.com/mock-reviews',
      reviews: ['stay', 'event', 'food', 'stay', 'event', 'general'].map((topic, i) => ({
        id: 'mock-' + (i + 1), name: 'Mock Reviewer', rating: i === 3 ? 4 : 5, date: addDays(today, -35 * i),
        text: `MOCK review ${i + 1} (${topic}), layout test only.` + (i % 2 ? ' A longer sample so the card wraps onto several lines and shows the more button.' : ''),
        source: i === 2 ? 'whatsapp' : 'google', link: '', topic: topic, featured: i === 0
      }))
    };
  }
  /* MOCK:END */

  function normaliseReviews(json) {
    const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
    const httpUrl = (v) => (/^https?:\/\//i.test(String(v || '')) ? String(v) : '');
    return {
      rating: num(json.rating),
      count: num(json.count) === null ? null : Math.floor(num(json.count)),
      url: httpUrl(json.url) || null,
      // Text is passed through exactly as sent; rows without text are skipped
      reviews: (Array.isArray(json.reviews) ? json.reviews : []).filter((r) => r && String(r.text || '').trim()).map((r) => ({
        id: String(r.id || ''), name: String(r.name || ''), rating: num(r.rating), text: String(r.text),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) ? String(r.date) : '',
        source: String(r.source || 'other'), link: httpUrl(r.link), topic: String(r.topic || 'general'),
        featured: r.featured === true || String(r.featured).toLowerCase() === 'true'
      }))
    };
  }

  function reviews() {
    const config = getConfig();
    /* MOCK:START */
    if (config.USE_MOCK || /[?&]mockreviews=1\b/.test(location.search)) return Promise.resolve({ ok: true, data: mockReviews() });
    /* MOCK:END */
    try {
      const hit = JSON.parse(sessionStorage.getItem(REVIEWS_KEY));
      if (hit && Date.now() - hit.at < 600000) return Promise.resolve({ ok: true, data: hit.data });
    } catch (e) {}
    if (!reviewsPromise) {
      reviewsPromise = (async function () {
        let json;
        try {
          const res = await fetchWithTimeout(`${config.API_URL}?action=reviews`, undefined, 15000);
          json = await res.json();
        } catch (err) {
          json = null;
        }
        if (!json || !json.ok) {
          reviewsPromise = null;
          const code = (json && json.code) || 'NETWORK';
          return { ok: false, code: code, error: getErrorMessage(code) };
        }
        const data = normaliseReviews(json.data && json.data.reviews ? json.data : json);
        try { sessionStorage.setItem(REVIEWS_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
        return { ok: true, data: data };
      })();
    }
    return reviewsPromise;
  }

  window.NSG.api = {
    getInfo: getInfo,
    infoChanged: infoChanged,
    getAvailability: getAvailability,
    getQuote: getQuote,
    cars: cars,
    addons: addons,
    createBooking: createBooking,
    submitPayment: submitPayment,
    getBooking: getBooking,
    eventEnquiry: eventEnquiry,
    reviews: reviews
  };

  // Mock internals shared with api.link.js (pay-link and staff actions); unused in live mode
  // (today/addDays are live display helpers for api.link.js, so they stay outside the MOCK block)
  window.NSG.api._mock = {
    /* MOCK:START */
    bookings: getMockBookings, save: saveMockBookings, blocks: getMockBlocks, saveBlocks: saveMockBlocks,
    info: MOCK_INFO, addons: MOCK_ADDONS, price: mockPriceAddons,
    /* MOCK:END */
    today: getTodayKolkataStr, addDays: addDays
  };
})();
