/**
 * NSG ROYAL RESORT — API CLIENT & NORMALISER
 * api.js: Only file that knows raw response shapes (SPEC Section 7 & 9, docs/api.md)
 * Methods: getInfo, getAvailability, getQuote, addons, cars, createBooking, submitPayment, getBooking, eventEnquiry
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
        packageName: 'Whole Resort',
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

  // Seed 6+ blocked nights: 2-night block, single night between free days, and 3-night block
  function getSeedBlockedNights() {
    const today = getTodayKolkataStr();
    const b1 = addDays(today, 4);
    const b2 = addDays(today, 5); // 2-night block: +4, +5
    const b3 = addDays(today, 9); // single night: +9 (+8 and +10 are free)
    const b4 = addDays(today, 18);
    const b5 = addDays(today, 19);
    const b6 = addDays(today, 20); // 3-night block: +18, +19, +20

    const blocked = new Set([b1, b2, b3, b4, b5, b6]);

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
    packages: [
      {
        id: 'whole',
        name: 'Whole Resort',
        weekdayRate: 40000,
        weekendRate: 50000,
        advance: 10000,
        maxGuests: 100
      },
      {
        id: 'penthouse',
        name: 'Penthouse + Pool, Turf & Garden',
        weekdayRate: 15000,
        weekendRate: 20000,
        advance: 5000,
        maxGuests: 20
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
    { id: 'mock-cake', category: 'food', name: 'Mock celebration cake', description: 'Mock item for testing.', unit: 'per_qty', price: 800, maxQty: 4, confirmRequired: false, slot: '', details: '' }
  ];

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

  // [{id, qty}] -> "id:qty,id:qty" for GET quote
  function addonsParam(addons) {
    return (Array.isArray(addons) ? addons : [])
      .filter((a) => a && a.id)
      .map((a) => encodeURIComponent(a.id) + ':' + (Number(a.qty) || 1))
      .join(',');
  }

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
        if (qty < 1 || qty > item.maxQty) return { error: true };
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


  // -------------------------------------------------------------------------
  // 1. GET info
  // -------------------------------------------------------------------------
  // Shared by every caller on a page; a failed result is not cached so a later call retries
  let infoPromise = null;
  function getInfo() {
    if (!infoPromise) {
      infoPromise = loadInfo().then(function (r) {
        if (!r.ok) infoPromise = null;
        return r;
      });
    }
    return infoPromise;
  }

  function toAmount(v) {
    const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
    return n > 0 ? n : 0;
  }

  // Accepts packages as an array or as an object keyed by id
  function normalisePackages(raw) {
    const list = Array.isArray(raw) ? raw : Object.keys(raw || {}).map((k) => Object.assign({ id: k }, raw[k]));
    return list.map((p) => ({
      id: String(p.id || p.packageId || '').trim().toLowerCase(),
      name: p.name || p.title || '',
      weekdayRate: toAmount(p.weekdayRate ?? p.weekday ?? p.rateWeekday),
      weekendRate: toAmount(p.weekendRate ?? p.weekend ?? p.rateWeekend),
      advance: toAmount(p.advance ?? p.advanceAmount ?? p.deposit),
      maxGuests: toAmount(p.maxGuests ?? p.capacity ?? p.guests)
    }));
  }

  async function loadInfo() {
    const config = getConfig();
    if (config.USE_MOCK) {
      return { ok: true, data: MOCK_INFO };
    }

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
    if (config.USE_MOCK) {
      const allBlocked = getSeedBlockedNights();
      const filtered = allBlocked.filter((d) => (!from || d >= from) && (!to || d <= to));
      return { ok: true, data: filtered };
    }

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
      const priced = mockPriceAddons(addons, guests, nights);
      if (priced.error) return { ok: false, code: 'INVALID_ADDON', error: getErrorMessage('INVALID_ADDON') };
      const baseTotal = total;
      total = baseTotal + priced.total;
      const balance = Math.max(0, total - advance);

      return {
        ok: true,
        data: {
          packageId: pkg.id,
          nights: nights,
          breakdown: breakdown,
          baseTotal: baseTotal,
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
  // 4. GET offers
  // -------------------------------------------------------------------------

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
      if (!isEvent && guestsCount > pkg.maxGuests) {
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
            upiId: (json.payment && json.payment.upiId) || 'nsgresort@upi',
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
  // 6. POST submitPayment (bookingId, utr)
  // -------------------------------------------------------------------------
  async function submitPayment(bookingId, utr) {
    const config = getConfig();
    const cleanUtr = String(utr || '').trim();

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
      const booking = allBookings[bookingId];
      if (!booking) {
        return { ok: false, code: 'NOT_FOUND', error: getErrorMessage('NOT_FOUND') };
      }

      booking.status = 'PAYMENT_SUBMITTED';
      booking.utr = cleanUtr;
      // Flips to CONFIRMED 20 seconds later
      booking.autoConfirmAt = Date.now() + 20000;
      saveMockBookings(allBookings);

      return {
        ok: true,
        data: {
          bookingId: bookingId,
          message: 'Payment reference received. Staff will verify and confirm shortly.'
        }
      };
    }

    try {
      let res;
      try {
        res = await fetchWithTimeout(config.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'submitPayment',
            bookingId: bookingId,
            utr: cleanUtr
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
    if (config.USE_MOCK) {
      return { ok: true, data: MOCK_ADDONS.map(normaliseAddon) };
    }
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

  window.NSG.api = {
    getInfo: getInfo,
    getAvailability: getAvailability,
    getQuote: getQuote,
    cars: cars,
    addons: addons,
    createBooking: createBooking,
    submitPayment: submitPayment,
    getBooking: getBooking,
    eventEnquiry: eventEnquiry
  };
})();
