# NSG Royal Resort backend API (Code.merged.gs)

One Google Apps Script web app. GET uses query parameters. POST sends JSON as the body with `Content-Type: text/plain` (this avoids a CORS preflight). Every response is JSON:

```json
{ "ok": true, "...": "..." }
{ "ok": false, "error": "Readable message", "code": "ERROR_CODE" }
```

Contents: [Public: website](#public-website) · [Packages](#packages) · [Add-ons](#add-ons) · [Reviews](#reviews) · [Guest pay page](#guest-pay-page) · [Staff app](#staff-app) · [Telegram](#telegram) · [Sheets](#sheets) · [Error codes](#error-codes)

---

## Public: website

| Action | Method | Purpose |
|---|---|---|
| `info` | GET | Resort name, minNights, maxGuests, active packages |
| `availability&from&to` | GET | Blocked dates in [from, to) |
| `quote&package&checkIn&checkOut&guests[&addons]` | GET | Price for a stay |
| `addons` | GET | Active add-ons |
| `getByToken&t=` | GET | Pay-link booking for the guest pay page |
| `reviews` | GET | Google rating and approved guest reviews |
| `createBooking` | POST | Website booking (HOLD) |
| `submitPayment` | POST | Guest sends the UPI reference (UTR) |
| `eventEnquiry` | POST | Event enquiry (Events sheet) |

`createBooking` works as before. Its response now also has `payment`, the same object `getByToken` returns, and `extraGuests` / `extraGuestsTotal` (see [Packages](#packages)).

### POST submitPayment

Website guests send `bookingId`; pay-link guests send `token`.

```json
{ "action": "submitPayment", "token": "3fa9c0…(32 hex)", "utr": "412345678901" }
{ "action": "submitPayment", "bookingId": "BK-MWA83RCP-47Y7", "utr": "412345678901" }
```

```json
{ "ok": true, "message": "Payment reference received. Staff will verify and confirm shortly.", "bookingId": "BK-MWA83RCP-47Y7" }
```

- The UTR is stored in upper case. A UTR already used on another booking gives `DUPLICATE_UTR`.
- If the hold has run out but the dates are still free, the payment is accepted (the booking is revived). If the dates were taken, staff get a "PAID BUT DATES TAKEN" Telegram alert and the guest gets `DATES_TAKEN_CONTACT_US`.
- The Telegram alert for pay-link bookings shows **VIA PAY LINK**, the staff member who created it, **Expected: ₹5,000** in bold, and "Special price" when set.

---

## Packages

All package data (names, rates, advance, guest limits) comes from the **Packages** tab, cached for 5 minutes. After editing the tab, use the Sheet menu **NSG → Refresh packages** to apply it at once. Info, quote, createBooking, the staff actions, Telegram alerts, emails, WhatsApp texts and getByToken all read it. Only one booking at a time across all packages (one calendar).

### GET ?action=info

```json
{ "ok": true, "resortName": "NSG Royal Resort", "minNights": 2, "maxGuests": 100,
  "packages": [
    { "id": "whole", "name": "Royal Estate", "subtitle": "Entire Resort",
      "description": "The whole resort, both floors, just for your group.",
      "includes": ["bedrooms","lounge","penthouse_lounge","terrace","kitchen","bar","home_theatre","pool","turf","garden"],
      "excludes": [], "bedrooms": 4, "bathrooms": null, "maxGuests": 25,
      "weekdayRate": 25000, "weekendRate": 28000, "advance": 10000,
      "extraGuestFee": 500, "maxExtraGuests": 5, "popular": true } ] }
```

- Only active packages, sorted by `order`. A blank number is `null`; `extraGuestFee` is `null` when no extra guests are allowed (then `maxExtraGuests` is 0).
- `includes` / `excludes` keys: bedrooms, lounge, penthouse_lounge, terrace, kitchen, bar, home_theatre, pool, turf, garden, wifi, parking.
- Fri and Sat nights use `weekendRate`; other nights use `weekdayRate`.

### Extra guests

Guests above `maxGuests` are allowed up to `maxGuests + maxExtraGuests`, only when `extraGuestFee` is set. Charge = `extraGuestFee × extra guests × nights`. It is its own line, added to `total`:

```json
GET ?action=quote&package=whole&checkIn=2027-03-01&checkOut=2027-03-03&guests=28
→ { "ok": true, "nights": 2, "breakdown": [ { "date": "2027-03-01", "rate": 25000 }, { "date": "2027-03-02", "rate": 25000 } ],
    "package": "whole", "packageName": "Royal Estate", "baseTotal": 50000,
    "extraGuests": { "count": 3, "fee": 500, "nights": 2, "total": 3000, "label": "Extra guests (3 × ₹500 × 2 nights)" },
    "extraGuestsTotal": 3000, "addonsBreakdown": [], "addonsTotal": 0,
    "total": 53000, "advance": 53000, "balance": 0 }
```

- `extraGuests` is `null` when there are none. It is also in createBooking, staffQuote, staffBooking and getByToken (`booking.extraGuests`), and shows as a line in Telegram alerts and the confirmation email.
- Above the limit: `MAX_GUESTS` with the numbers, e.g. `{ "ok": false, "code": "MAX_GUESTS", "error": "Royal Estate allows up to 25 guests, plus up to 5 extra guests at ₹500 per guest per night (30 in total).", "maxGuests": 25, "maxExtraGuests": 5, "maxTotalGuests": 30 }`.
- Events have no package, so no extra-guest fee applies (the agreed `specialTotal` is all-in).

### Inactive packages and old bookings

- A package with `active` TRUE but a blank or invalid `maxGuests`, `weekdayRate`, `weekendRate` or `advance` is treated as inactive and written once to the Log sheet. Quote/booking for an inactive package gives `INVALID_PACKAGE`.
- Bookings that already have package `whole` or `penthouse` keep working; their names come from the tab (or the stored id if the row is gone).
- If the Packages tab is missing, the old Config keys (`whole_weekdayRate`, `penthouse_weekdayRate`, …) are used as before.

---

## Add-ons

### GET ?action=addons

```json
{ "ok": true, "addons": [
  { "id": "food-biryani", "category": "food", "name": "Biryani package",
    "description": "Serves one person. Delivered hot to the resort.",
    "unit": "per_qty", "price": 250, "minQty": 8, "maxQty": 100,
    "confirmRequired": true, "slot": "food-biryani", "details": "" } ] }
```

| unit | line total |
|---|---|
| flat | price |
| per_guest | price x guests |
| per_night | price x nights |
| per_qty | price x qty, qty from `minQty` (default 1) to `maxQty` (default 10) |

`price: null` means "price on request" (shown but not bookable). Add-ons are sent as `addons=id:qty,id:qty` on quote, or `[{ "id": "food-biryani", "qty": 8 }]` in JSON bodies. A bad add-on gives `INVALID_ADDON`, e.g. `Biryani package: minimum 8, maximum 100.`

---

## Reviews

### GET ?action=reviews

```json
{ "ok": true, "rating": 4.8, "count": 127, "url": "https://g.page/r/…",
  "reviews": [
    { "id": "r1", "name": "Priya S.", "rating": 5, "text": "Lovely pool and very helpful staff…",
      "date": "2026-10-12", "source": "google", "link": "https://…", "topic": "stay", "featured": true } ] }
```

- `rating`, `count` and `url` come from Config `googleRating`, `googleReviewCount` and `googleReviewUrl`. They are `null` when blank, so hide the badge then.
- Only rows with `approved` = TRUE are returned (text compare, so `TRUE`/`true` both count; `yes` does not).
- Order: featured first, then `order` (low first, blank last), then newest `date`. At most 30 rows; `text` is cut to 400 characters (ending in `…`).
- `rating` per review is a whole number 1–5, or `null` if the cell is not. Unknown `source` becomes `other`, unknown `topic` becomes `general`, and `link` is `""` unless it starts with http(s).
- Cached for 10 minutes: Sheet edits show up within 10 minutes (running `migrateSheets()` clears the cache at once).

---

## Guest pay page

### GET ?action=getByToken&t=TOKEN

For pay-link and walk-in bookings only. It never returns phone, email, UTR, createdBy or staff notes. Limited to 30 requests per hour per token.

```json
{
  "ok": true,
  "booking": {
    "bookingId": "BK-MWA83RCP-47Y7", "firstName": "Ravi", "status": "HOLD",
    "bookingType": "stay", "packageName": "Royal Estate", "eventType": "",
    "checkIn": "2027-01-09", "checkOut": "2027-01-11", "nights": 2, "guests": 6,
    "addons": [{ "name": "Biryani package", "qty": 8, "line": 2000 }],
    "total": 40000, "advance": 5000, "advancePaid": null, "balance": 35000,
    "isSpecialPrice": true, "holdExpiresAt": "2027-01-02T10:00:00.000Z",
    "checkInTime": "15:00", "checkOutTime": "11:00"
  },
  "payment": { "mode": "upi", "upiId": "nsgresort@upi", "payeeName": "NSG Royal Resort",
               "amount": 5000, "upiLink": "upi://pay?pa=…", "note": "Booking BK-MWA83RCP-47Y7" }
}
```

- `status` is HOLD, PAYMENT_SUBMITTED, CONFIRMED, EXPIRED, REJECTED or CANCELLED. A HOLD past its expiry shows as EXPIRED.
- `payment` is null unless the status is HOLD.
- `advancePaid` is set only when CONFIRMED.
- An unknown token gives `NOT_FOUND`.

---

## Staff app

All staff have equal rights. Every action is a POST whose JSON body includes `"staffToken"` (never put it in a URL), except `staffLogin`.

- A missing, expired or revoked token, or a deactivated staff member, gives code `AUTH`: show the PIN screen again.
- Sessions last `staffSessionDays` (30) and are extended on every use.
- Each session can make 120 actions per hour (`RATE_LIMITED`).
- Every write goes to the Log sheet (who, action, bookingId, before -> after) and posts a one-line Telegram notice.

### staffLogin / staffMe / staffLogout

```json
{ "action": "staffLogin", "pin": "482915", "deviceId": "a-random-id-stored-on-the-device" }
→ { "ok": true, "token": "40 hex chars", "name": "Asha" }
```

- Wrong PIN → `AUTH`.
- 5 wrong PINs from one `deviceId` lock that device for 15 min (`LOCKED`).
- 15 wrong PINs overall within 15 min pause all staff logins for 15 min (`LOCKED`).
- Every login answer takes about 400 ms.

```json
{ "action": "staffMe", "staffToken": "…" }     → { "ok": true, "name": "Asha" }
{ "action": "staffLogout", "staffToken": "…" } → { "ok": true, "message": "Logged out." }
```

### staffLookupPhone

```json
{ "action": "staffLookupPhone", "staffToken": "…", "phone": "9876511111" }
→ { "ok": true, "found": true, "name": "Ravi Kumar", "lastStay": "Jan 2027", "visits": 2 }
→ { "ok": true, "found": false }
```

`visits` counts CONFIRMED bookings. `lastStay` is the month of the latest one.

### staffQuote (writes nothing)

```json
{ "action": "staffQuote", "staffToken": "…", "bookingType": "stay", "package": "whole",
  "checkIn": "2027-01-09", "checkOut": "2027-01-11", "guests": 6,
  "addons": [{ "id": "food-biryani", "qty": 8 }], "specialTotal": 40000, "advance": 5000 }
→ { "ok": true, "bookingType": "stay", "package": "whole", "packageName": "Royal Estate", "eventType": "",
    "checkIn": "2027-01-09", "checkOut": "2027-01-11", "nights": 2, "guests": 6,
    "breakdown": [{ "date": "2027-01-09", "rate": 25000 }, { "date": "2027-01-10", "rate": 20000 }],
    "baseTotal": 45000, "extraGuests": null, "extraGuestsTotal": 0, "addonsBreakdown": [{ "id": "food-biryani", "name": "Biryani package", "qty": 8, "unitPrice": 250, "lineTotal": 2000 }],
    "addonsTotal": 2000, "standardTotal": 47000, "finalTotal": 40000, "isSpecialPrice": true,
    "advance": 5000, "minAdvance": 1000, "balance": 35000,
    "warnings": ["Special price is 15% below standard (₹47,000)"] }
```

- `specialTotal` is the agreed all-in price. It replaces the standard total (package plus extra guests plus add-ons).
- Events: send `"bookingType": "event", "eventType": "wedding"` (wedding, birthday, corporate, getaway, other). `specialTotal` is required (`SPECIAL_TOTAL_REQUIRED`), and `standardTotal` and `baseTotal` are null. A one-day event has checkOut on the next day.
- The default advance is the package `advance` from the Packages tab, the event's `eventAdvance_<type>` if that Config key exists, or `minAdvance`.
- Possible warnings: "Advance is below minimum ₹1,000", "Advance is more than the total ₹…", "Special price is X% below/above standard (₹…)".

### staffCreateLink

```json
{ "action": "staffCreateLink", "staffToken": "…", "requestId": "client-uuid-v4",
  "bookingType": "stay", "package": "whole", "checkIn": "2027-01-09", "checkOut": "2027-01-11",
  "guests": 6, "name": "Ravi Kumar", "phone": "9876511111",
  "addons": [{ "id": "food-biryani", "qty": 8 }], "specialTotal": 40000, "priceNote": "repeat guest",
  "advance": 5000, "holdHours": 12, "note": "Asked for early check-in" }
→ { "ok": true, "bookingId": "BK-MWA83RCP-47Y7", "token": "32 hex chars",
    "payUrl": "https://www.nsgroyalresort.in/pay.html?t=…",
    "guestMessage": "Hi Ravi! Your Royal Estate at NSG Royal Resort is ready.\nSat 9 Jan – Mon 11 Jan · 6 guests\nTotal ₹40,000\nPay advance ₹5,000 here: https://…\nBalance ₹35,000 at the resort.\nDates held till Sat 9 Jan, 6:30 PM.",
    "waUrl": "https://wa.me/919876511111?text=Hi%20Ravi…",
    "status": "HOLD", "total": 40000, "advance": 5000, "balance": 35000,
    "holdExpiresAt": "2027-01-02T10:00:00.000Z", "warnings": [] }
```

- **requestId**: generate one per form submission. Sending the same requestId again returns the existing booking unchanged, with `"duplicate": true`.
- **advance** must be a whole amount from `minAdvance` to the total. Otherwise you get `INVALID_ADVANCE` with `minAdvance` and `maxAdvance`.
- **holdHours** is 6, 12, 24 or 48. Leave it out to use Config `linkHoldHours`.
- **Dates already taken** give `DATES_UNAVAILABLE` with what holds them: `"conflict": { "name": "Ravi", "source": "link", "status": "HOLD", "bookingId": "BK-…" }`. A manual block shows `"source": "block", "status": "BLOCKED"`.
- **`"confirmWithoutAdvance": true`** (requires `note`): the booking is created CONFIRMED with source `walkin`, `advancePaid` 0 and balance = total. A token is still created, so the guest can view the confirmation, and the guest message uses the "confirmed" wording.
- **Guest message wording** comes from Config `linkMessageTemplate`.

### staffUpdateLink

```json
{ "action": "staffUpdateLink", "staffToken": "…", "bookingId": "BK-…",
  "fields": { "checkIn": "2027-01-16", "checkOut": "2027-01-18", "guests": 8 } }
→ same fields as staffCreateLink, plus "changed": ["checkIn", "checkOut", "guests", "total"], "warnings": []
```

- Only pay-link bookings in HOLD or PAYMENT_SUBMITTED can be edited.
- Fields: `guests`, `checkIn`, `checkOut`, `package`, `eventType`, `addons`, `specialTotal` (send "" to go back to the standard price), `advance` (HOLD only), `name`, `note`, `priceNote`.
- Totals are recomputed, new dates are re-checked (`DATES_UNAVAILABLE` + `conflict`), and the token stays the same.

### staffExtendHold

```json
{ "action": "staffExtendHold", "staffToken": "…", "bookingId": "BK-…", "hours": 6 }
→ { "ok": true, "bookingId": "BK-…", "status": "HOLD", "holdExpiresAt": "…", "revived": false }
```

- `hours` is 6 or 24.
- A HOLD is extended from its current expiry.
- An EXPIRED link is revived to HOLD if its dates are still free (`revived: true`); otherwise you get `DATES_UNAVAILABLE` + `conflict`.

### staffConfirm / staffReject

```json
{ "action": "staffConfirm", "staffToken": "…", "bookingId": "BK-…", "amountReceived": 4000 }
→ { "ok": true, "bookingId": "BK-…", "status": "CONFIRMED", "already": false, "advancePaid": 4000, "balance": 36000,
    "warnings": ["Received ₹4,000 but the agreed advance was ₹5,000"] }
{ "action": "staffReject", "staffToken": "…", "bookingId": "BK-…" }
→ { "ok": true, "bookingId": "BK-…", "status": "REJECTED", "already": false }
```

- These use the same code as the Telegram buttons, and both are idempotent.
- `amountReceived` defaults to the agreed advance and is stored in `advancePaid`.
- An EXPIRED booking that has a UTR can be confirmed if its dates are free.
- The original Telegram payment message is edited to show the outcome.

### staffCollectBalance

```json
{ "action": "staffCollectBalance", "staffToken": "…", "bookingId": "BK-…", "amount": 36000, "method": "cash" }
→ { "ok": true, "bookingId": "BK-…", "balancePaid": 36000, "balanceMethod": "cash", "remaining": 0 }
```

- CONFIRMED only.
- `method` is cash, upi or other.
- Repeated payments add up.
- More than the remaining amount gives `INVALID_AMOUNT` with `remaining`.

### staffCancel

```json
{ "action": "staffCancel", "staffToken": "…", "bookingId": "BK-…", "reason": "Guest changed plans" }
→ { "ok": true, "bookingId": "BK-…", "status": "CANCELLED", "already": false }
```

- Works on HOLD, PAYMENT_SUBMITTED, CONFIRMED and EXPIRED bookings, and frees the dates.
- The Telegram notice mentions any advance received.

### staffBlock / staffUnblock

```json
{ "action": "staffBlock", "staffToken": "…", "dates": ["2027-02-08", "2027-02-09"], "note": "Maintenance" }
→ { "ok": true, "blocked": ["2027-02-08", "2027-02-09"], "alreadyBlocked": [] }
{ "action": "staffUnblock", "staffToken": "…", "dates": ["2027-02-08"] }
→ { "ok": true, "unblocked": ["2027-02-08"], "notBlocked": [] }
```

- Up to 60 dates per call.
- A date with an active booking refuses the whole request with `DATES_UNAVAILABLE` and `conflict` (including `date`).

### staffList / staffCalendar

Both take `from` and `to` (YYYY-MM-DD). They cover the nights in [from, to), at most 400 days.

```json
{ "action": "staffList", "staffToken": "…", "from": "2027-01-01", "to": "2027-02-01" }
→ { "ok": true, "from": "…", "to": "…",
    "bookings": [{ "bookingId": "BK-…", "firstName": "Ravi", "phoneLast4": "1111",
      "checkIn": "2027-01-09", "checkOut": "2027-01-11", "nights": 2, "guests": 6,
      "bookingType": "stay", "package": "whole", "packageName": "Royal Estate", "eventType": "",
      "status": "CONFIRMED", "source": "link", "total": 40000, "advance": 5000, "advancePaid": 5000,
      "balance": 35000, "balancePaid": 0, "remaining": 35000, "isSpecialPrice": true,
      "createdBy": "Asha", "holdExpiresAt": null, "token": "…" }],
    "blocks": [{ "blockId": "BLOCK-2027-01-20", "date": "2027-01-20", "reason": "Maintenance", "addedBy": "Asha" }] }

{ "action": "staffCalendar", "staffToken": "…", "from": "2027-01-08", "to": "2027-01-12" }
→ { "ok": true, "from": "…", "to": "…", "days": [
    { "date": "2027-01-08", "state": "free" }, { "date": "2027-01-09", "state": "confirmed" },
    { "date": "2027-01-10", "state": "confirmed" }, { "date": "2027-01-11", "state": "free" }] }
```

- The list includes every source (web, link, walkin) and every status.
- Calendar states are free, hold, pending (payment submitted), confirmed and blocked. When several apply, the strongest wins: confirmed > pending > hold > blocked.

### staffBooking / staffResendMessage

```json
{ "action": "staffBooking", "staffToken": "…", "bookingId": "BK-…" }
→ { "ok": true, "booking": { …staffList fields…, "name": "Ravi Kumar", "phone": "9876511111", "email": "",
    "utr": "UTR999888777", "notes": "", "staffNote": "…", "priceNote": "repeat guest",
    "createdAt": "…", "confirmedAt": "…", "updatedBy": "", "updatedAt": null,
    "balanceMethod": "", "settledAt": null, "settledBy": "", "addons": [ … ], "addonsTotal": 2000,
    "baseTotal": 45000, "payUrl": "…", "requestId": "…" } }

{ "action": "staffResendMessage", "staffToken": "…", "bookingId": "BK-…" }
→ { "ok": true, "bookingId": "BK-…", "status": "HOLD", "payUrl": "…", "guestMessage": "…", "waUrl": "…" }
```

### staffReviewMessage

```json
{ "action": "staffReviewMessage", "staffToken": "…", "bookingId": "BK-…" }
→ { "ok": true, "bookingId": "BK-…", "message": "Hi Ravi! Thank you for choosing NSG Royal Resort. …", "waUrl": "https://wa.me/919876511111?text=…" }
```

- Open `waUrl` to send the guest a WhatsApp thank-you message with the Config `googleWriteReviewUrl` link.
- Confirmed bookings only (`INVALID_STATUS` otherwise). A blank `googleWriteReviewUrl` gives `NO_REVIEW_URL`, and a booking without a valid mobile gives `INVALID_PHONE`.
- Posts the Telegram notice "Review request sent by <staff>" and writes a Log row.

### Balance rule

`balance` = total − advance received (when CONFIRMED) or − agreed advance (otherwise). `remaining` = balance − balancePaid. The Bookings `balanceAmount` column is kept equal to `balance`.

---

## Telegram

Commands from allowed chats: `/pending`, `/list`, `/block YYYY-MM-DD [...] [reason]`, `/unblock YYYY-MM-DD [...]`, `/cancel <bookingId> [reason]`, `/help`.

- Confirm and Reject buttons work as before.
- Messages use HTML formatting.
- One-line notices are sent for: link created, updated, hold extended or revived, confirmed (also without advance), rejected, balance collected, cancelled, blocked/unblocked, review request sent, and login lockouts.
- Every `reminderMinutes`, payments waiting for confirmation are reminded, up to `reminderMaxCount` times, outside quiet hours.

---

## Sheets

**Bookings.** Columns from S onward: addons, addonsTotal, baseTotal, bookingType, eventType, balanceAmount, lastReminderAt, reminderCount, source, linkToken, createdBy, updatedBy, updatedAt, priceNote, isSpecialPrice, advancePaid, balancePaid, balanceMethod, settledAt, settledBy, staffNote, requestId, extraGuests, extraGuestCharge.
- `total` = baseTotal + extraGuestCharge + addonsTotal (or the special price).
- `amount` is the advance agreed (what the UPI link charges).
- Website rows leave most of these columns blank (source blank = web).

**Staff.** Columns: name, pinHash, active, sessionVersion, lastLogin, failedCount, lockedUntil.
- Only SHA-256(PIN + STAFF_PEPPER) is stored. Set PINs with the Sheet menu **Staff → Set staff PIN…** or `setStaffPin(name, pin)`.
- PINs are 6 digits. Repeated digits (000000) and straight runs (123456) are refused, and a PIN must be unique among active staff.
- Set `active` to FALSE to block a person immediately. Changing a PIN signs out all of that person's sessions.
- Lockouts are tracked per device and overall, because a PIN login does not say who is trying. `failedCount` is reset on a good login, and `lockedUntil` is not used.

**ManualBlocks.** Columns: blockId, blockDate, reason, createdAt, addedBy.

**Packages.** Columns: id, name, subtitle, description, includes, excludes, bedrooms, bathrooms, maxGuests, weekdayRate, weekendRate, advance, extraGuestFee, maxExtraGuests, order, active, popular.
- `migrateSheets()` creates the tab and seeds whole (Royal Estate, active), ground (Grand Suite) and penthouse (Crown Penthouse) only when it has no rows. ground and penthouse start inactive with a blank maxGuests.
- `includes`/`excludes` are comma-separated keys. `id`, `includes`, `excludes`, `active` and `popular` are plain text.
- Edits show up within 5 minutes, or at once with **NSG → Refresh packages** (it also lists any problems).

**Reviews.** Columns: id, name (as shown, e.g. "Priya S."), rating (1–5), text, date (YYYY-MM-DD, plain text), source (google | whatsapp | other), link, topic (stay | event | food | general), approved, featured, order.
- `migrateSheets()` creates the tab (no rows) and adds any missing column at the end. `date`, `approved` and `featured` are plain text.
- Rows with a blank `id` are ignored. Set `approved` to TRUE to publish a review, and `featured` to TRUE to pin it to the top.

**Config keys added by `migrateSheets()`.** Existing values are never changed.

| Key | Default |
|---|---|
| linkHoldHours | 24 |
| minAdvance | 1000 |
| payPageUrl | `[TBD: https://www.nsgroyalresort.in/pay.html]` |
| staffSessionDays | 30 |
| linkMessageTemplate | Default guest message (placeholders `{name} {package} {dates} {guests} {total} {advance} {balance} {link} {holdUntil}`) |
| checkInTime | 15:00 |
| checkOutTime | 11:00 |
| reminderMinutes | 30 |
| reminderMaxCount | 12 |
| reminderQuietStartHour | 23 |
| reminderQuietEndHour | 7 |
| googleRating | blank (e.g. 4.8) |
| googleReviewCount | blank (e.g. 127) |
| googleReviewUrl | blank (page to read Google reviews) |
| googleWriteReviewUrl | blank ("write a review" link sent by `staffReviewMessage`) |

---

## Error codes

| Code | Meaning |
|---|---|
| AUTH | Wrong PIN, or staff token missing, expired or revoked |
| LOCKED | Too many wrong PINs (device or all logins), wait 15 min |
| RATE_LIMITED | Too many requests (staff 120/hour/session, getByToken 30/hour/token, website 3 holds/hour/phone) |
| INVALID_ADVANCE | Advance not a whole amount from minAdvance to the total |
| INVALID_PRICE / SPECIAL_TOTAL_REQUIRED | Bad specialTotal / event without specialTotal |
| INVALID_HOLD_HOURS | holdHours not 6/12/24/48, or extend hours not 6/24 |
| NOTE_REQUIRED | confirmWithoutAdvance without a note |
| DATES_UNAVAILABLE | Dates taken; `conflict` says by what |
| DATES_TAKEN / DATES_TAKEN_CONTACT_US | Paid after expiry but the dates are gone (staff / guest side) |
| DUPLICATE_UTR | UTR already used on another booking |
| INVALID_ADDON | Unknown, inactive or unpriced add-on, or quantity outside minQty..maxQty |
| INVALID_STATUS | Action not allowed in the booking's current status |
| INVALID_AMOUNT / INVALID_METHOD | Bad balance payment |
| NOT_A_LINK | Action needs a pay-link booking |
| NO_REVIEW_URL | Config googleWriteReviewUrl is blank |
| MAX_GUESTS | Too many guests; has `maxGuests`, `maxExtraGuests`, `maxTotalGuests` when a package is known |
| INVALID_PACKAGE | Unknown or inactive package |
| NOT_FOUND, MISSING_FIELD, INVALID_PHONE, INVALID_DATE, PAST_DATE, MIN_NIGHTS, PRICE_NOT_SET, LOCK_TIMEOUT | As named |
