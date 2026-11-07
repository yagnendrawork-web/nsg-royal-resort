# NSG Royal Resort – Booking Backend

> **Stack:** Google Apps Script (V8) · Google Sheets (database) · Telegram Bot (staff alerts) · MailApp (guest email)

---

## Assumptions

All items below were unspecified and were assumed. Every value is stored in the **Config sheet** so you can change it without touching code.

| # | Assumption | Default value |
|---|-----------|--------------|
| 1 | Whole property is rented per booking (no room selection) | — |
| 2 | Weekday = Sun, Mon, Tue, Wed, Thu nights; Weekend = Fri & Sat nights | — |
| 3 | Weekday nightly rate | Rs 5,000 |
| 4 | Weekend (Fri/Sat) nightly rate | Rs 7,000 |
| 5 | Minimum stay | 2 nights |
| 6 | Maximum guests per booking | 100 |
| 7 | Hold duration before UTR submission | 20 minutes |
| 8 | Hold duration after UTR submitted (while staff verify) | 360 minutes (6 h) |
| 9 | Check-in is inclusive; check-out is exclusive (standard hotel model) | — |
| 10 | Two bookings conflict if newIn < existingOut AND newOut > existingIn | — |
| 11 | Rate limiting: max 3 HOLD attempts per phone number per hour | — |
| 12 | UTR format: 8-22 alphanumeric characters (covers UPI/IMPS references) | — |
| 13 | A new HOLD does NOT generate a Telegram alert by default (notifyOnNewHold = false). Alert fires only when the guest submits the UTR. | — |
| 14 | Guest confirmation email is sent automatically on Confirm tap (if email provided) | — |
| 15 | WhatsApp notifications are stubbed (logs only) — plug in Interakt/Wati/Meta Cloud API when ready | — |
| 16 | The Telegram bot receives updates via webhook (not polling) | — |
| 17 | Multiple staff can share one group chat; ALLOWED_CHAT_IDS is a comma-separated list | — |
| 18 | Resort address configurable via Config key `resortAddress` | — |
| 19 | Hold duration after UTR submitted (default 1440 min = 24h) | — |
| 20 | Packages: `whole` (Rs 40k/50k) and `penthouse` (Rs 15k/20k) configurable via Config | — |

---

## Manual Setup Steps

### Step 1 - Create the Google Sheet

1. Go to sheets.google.com and create a Blank spreadsheet.
2. Name it `NSG Royal Resort - Bookings`.
3. Note the spreadsheet URL; you will bind the script to it in Step 2.

---

### Step 2 - Create the Apps Script project

1. Inside the sheet, click **Extensions -> Apps Script**.
2. The script editor opens, already bound to your sheet.
3. **Delete** the default `Code.gs` content.
4. **Copy-paste** `Code.gs` from this repository into the editor.
5. Click **Project Settings** (gear icon) and check **Show "appsscript.json" in editor**.
6. Open `appsscript.json` in the editor and replace its content with the `appsscript.json` from this repo.
7. Save with Ctrl+S (or Cmd+S on Mac).

---

### Step 3 - Set Script Properties (secrets)

Script Properties are never visible to the public and are not stored in the sheet.

1. In the Apps Script editor, click **Project Settings -> Script Properties**.
2. Add the following properties:

| Property key | Value | Notes |
|---|---|---|
| BOT_TOKEN | 7123456789:AAF... | From BotFather (see Step 5) |
| ALLOWED_CHAT_IDS | -1001234567890 | Comma-separated chat/group IDs (see Step 6) |
| WEBHOOK_SECRET | any random string | e.g. nsgR3s0rt-2025 -- authenticates Telegram webhook |
| WEB_APP_URL | filled in Step 4 | The deployed web app URL |

---

### Step 4 - Run setup functions

In the Apps Script editor, select the function name from the dropdown and click Run (triangle button):

```
1. setupSheets()       -- creates all sheets and default Config rows
2. installTriggers()   -- installs the 5-minute expiry trigger
```

After setupSheets(), go back to your sheet and verify five tabs exist:
Bookings, Events, Config, ManualBlocks, Log.

---

### Step 5 - Create the Telegram bot

1. Open Telegram and search for @BotFather.
2. Send `/newbot` and follow the prompts. BotFather gives you a bot token like `7123456789:AAFxyz...`.
3. Copy the token into the BOT_TOKEN Script Property.

---

### Step 6 - Find your Telegram chat ID

**Option A - Personal chat:**
1. Send any message to @userinfobot on Telegram.
2. It replies with your chat ID (a positive number).

**Option B - Group chat (recommended for a team):**
1. Add your new bot to the group.
2. Send a message in the group.
3. Visit `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` in your browser.
4. Look for `"chat":{"id":-100...}` -- the group's chat ID (negative, starts with -100).
5. Copy it into ALLOWED_CHAT_IDS.

For multiple staff getting independent alerts, use comma-separated IDs:
`-1001234567890,-1009876543210`

---

### Step 7 - Deploy as a Web App

1. Click **Deploy -> New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Settings:
   - Execute as: Me (your Google account)
   - Who has access: Anyone (anonymous -- required for the frontend)
4. Click Deploy.
5. Copy the **Web App URL** (e.g. `https://script.google.com/macros/s/AKfycb.../exec`).
6. Paste it into the WEB_APP_URL Script Property.

**Important:** Every time you edit Code.gs, you must create a New version via Deploy -> Manage deployments -> Edit -> New version -> Deploy.

---

### Step 8 - Register the Telegram webhook

Run `setWebhook()` from the Apps Script editor.
Check the execution log -- you should see `{"ok":true,"result":true,"description":"Webhook was set"}`.

---

### Step 9 - Test end-to-end

1. Open `test.html` in your browser (double-click the file).
2. Paste the Web App URL into the first field.
3. Walk through all 5 steps on the page.
4. Check Telegram -- you should receive an alert with Confirm and Reject buttons.
5. Tap Confirm -- verify the sheet shows CONFIRMED and a confirmation email was sent (if email was supplied).

---

### Step 10 - Block dates manually

1. Open the **ManualBlocks** sheet.
2. Add rows: blockId (any string), blockDate (YYYY-MM-DD), reason, createdAt.
3. Those dates immediately appear as unavailable via the availability endpoint.

---

## API Reference

Base URL: `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

### CORS Note

Apps Script does NOT support custom response headers or CORS preflight (OPTIONS).
The frontend MUST POST with Content-Type: text/plain (not application/json).
The JSON body is read from e.postData.contents server-side.
GET requests work normally from fetch().

---

### GET ?action=availability

Returns blocked dates in the given range and current nightly rates.

**Parameters:**

| Param | Type | Required | Example |
|---|---|---|---|
| from | YYYY-MM-DD | Yes | 2025-12-01 |
| to | YYYY-MM-DD | Yes | 2025-12-31 |

**Example request:**
```
GET /exec?action=availability&from=2025-12-01&to=2025-12-31
```

**Example response:**
```json
{
  "ok": true,
  "blockedDates": ["2025-12-14", "2025-12-15", "2025-12-16"],
  "weekdayRate": 5000,
  "weekendRate": 7000,
  "minNights": 2,
  "maxGuests": 100
}
```

---

### GET ?action=addons

Lists the active add-ons (food, travel, car, other) from the **Addons** sheet, sorted by `order`. Cached for 5 minutes, so sheet edits can take up to 5 minutes to show.

An item with a blank or non-numeric price (or an unknown unit) is returned with `"price": null`: show it as "price on request". It cannot be booked.

**Example response:**
```json
{
  "ok": true,
  "addons": [
    { "id": "biryani", "category": "food", "name": "Biryani package", "description": "...",
      "unit": "per_guest", "price": 350, "maxQty": 10, "confirmRequired": true, "slot": "", "details": "" },
    { "id": "pickup", "category": "travel", "name": "Station pickup", "description": "...",
      "unit": "flat", "price": null, "maxQty": 10, "confirmRequired": true, "slot": "", "details": "" }
  ]
}
```

**How each unit is priced** (server-side only; the client never sends prices):

| unit | line total |
|---|---|
| flat | price |
| per_guest | price x guests |
| per_night | price x nights (events count as 1 night) |
| per_qty | price x qty, qty from 1 to maxQty (default 10) |

Only `per_qty` items use a quantity; other units are counted once. Repeated ids are merged (their quantities are added).

---

### GET ?action=quote

Returns a per-night price breakdown and total. Price is always computed server-side.

**Parameters:**

| Param | Type | Required | Example |
|---|---|---|---|
| checkIn | YYYY-MM-DD | Yes | 2025-12-20 |
| checkOut | YYYY-MM-DD | Yes | 2025-12-23 |
| guests | integer | Yes | 4 |
| package | whole / penthouse | No (default whole) | whole |
| addons | id:qty,id:qty | No | biryani:1,boat:2 |

With add-ons the response also has `baseTotal` (package total), `addonsBreakdown` [{id, name, qty, unitPrice, lineTotal}] and `addonsTotal`. Then `total = baseTotal + addonsTotal`, `advance` is unchanged and `balance = total - advance`. Any bad add-on returns `INVALID_ADDON` with a message naming the item.

**Example response:**
```json
{
  "ok": true,
  "nights": 3,
  "breakdown": [
    { "date": "2025-12-20", "rate": 5000 },
    { "date": "2025-12-21", "rate": 5000 },
    { "date": "2025-12-22", "rate": 7000 }
  ],
  "total": 17000
}
```

---

### POST action=createBooking

Places a temporary HOLD. Returns the booking ID, amount, hold expiry, and UPI deep link.

**Request body (JSON string, Content-Type: text/plain):**

| Field | Type | Required | Notes |
|---|---|---|---|
| action | string | Yes | "createBooking" |
| name | string | Yes | max 100 chars |
| phone | string | Yes | 10-digit Indian mobile |
| email | string | No | for confirmation email |
| guests | integer | Yes | 1 to maxGuests |
| checkIn | YYYY-MM-DD | Yes | today or future |
| checkOut | YYYY-MM-DD | Yes | after checkIn |
| notes | string | No | max 500 chars |
| addons | array | No | [{ "id": "biryani", "qty": 1 }] -- priced again under the booking lock |
| _hp | string | No | honeypot -- must be blank |

With add-ons the response also has `baseTotal`, `addonsBreakdown` and `addonsTotal`.
- **Stays:** `total = baseTotal + addonsTotal`; `amount` (the advance paid now) is unchanged; `balance = total - amount`.
- **Events:** `total`, `balance` and `baseTotal` stay null; the add-ons and `addonsTotal` are stored and shown to staff and the guest as "to be confirmed with our team".

Staff alerts, reminders, the guest email and the WhatsApp text list each add-on as "name x qty = ₹amount", marking `confirmRequired` items "(to confirm)".

**Example JS fetch:**
```js
fetch(WEBAPP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({
    action: 'createBooking',
    name: 'Ravi Kumar', phone: '9876543210',
    email: 'ravi@example.com', guests: 4,
    checkIn: '2025-12-20', checkOut: '2025-12-23',
    notes: 'Anniversary trip', _hp: ''
  })
});
```

**Example response:**
```json
{
  "ok": true,
  "bookingId": "BK-M5X2A1-K3P7",
  "amount": 17000,
  "nights": 3,
  "breakdown": [
    { "date": "2025-12-20", "rate": 5000 },
    { "date": "2025-12-21", "rate": 5000 },
    { "date": "2025-12-22", "rate": 7000 }
  ],
  "holdExpiresAt": "2025-12-20T07:20:00.000Z",
  "upiLink": "upi://pay?pa=nsgresort%40upi&pn=NSG+Royal+Resort&am=17000&cu=INR&tn=Booking+BK-M5X2A1-K3P7&tr=BK-M5X2A1-K3P7",
  "message": "Booking hold placed. Complete payment within 20 minutes."
}
```

**Common errors:**
```json
{ "ok": false, "error": "Those dates are no longer available.", "code": "DATES_UNAVAILABLE" }
{ "ok": false, "error": "Minimum stay is 2 nights", "code": "MIN_NIGHTS" }
{ "ok": false, "error": "Too many bookings attempted.", "code": "RATE_LIMITED" }
{ "ok": false, "error": "Quantity for \"Boat ride\" must be between 1 and 4.", "code": "INVALID_ADDON" }
```

### GET ?action=getBooking

`bookingId` + `phoneLast4`. The `booking` object now also has `addons` [{id, name, qty, unitPrice, lineTotal, confirmRequired}] (empty for older bookings) and `addonsTotal` (null for older bookings).

---

### POST action=submitPayment

Marks the booking as PAYMENT_SUBMITTED and fires the Telegram alert with Confirm/Reject buttons.

**Request body:**

| Field | Type | Required |
|---|---|---|
| action | string | Yes ("submitPayment") |
| bookingId | string | Yes |
| utr | string | Yes (8-22 alphanumeric chars) |

**Example response:**
```json
{
  "ok": true,
  "bookingId": "BK-M5X2A1-K3P7",
  "message": "Payment reference received. Staff will verify and confirm shortly."
}
```

---

### POST action=eventEnquiry

Saves an event enquiry to the Events sheet and sends a Telegram alert. No payment step.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| action | string | Yes | "eventEnquiry" |
| name | string | Yes | |
| phone | string | Yes | Indian mobile |
| email | string | No | |
| eventType | string | Yes | wedding, birthday, corporate, other |
| eventDate | YYYY-MM-DD | No | |
| guests | integer | No | |
| notes | string | No | max 1000 chars |

**Example response:**
```json
{
  "ok": true,
  "eventId": "EV-M5X2B2-J9Q1",
  "message": "Enquiry received! Our team will contact you within 24 hours."
}
```

---

### Telegram Webhook (internal)

`POST ?source=telegram&key=<WEBHOOK_SECRET>`

Handled automatically when staff tap buttons in Telegram.

- Confirm: status becomes CONFIRMED, dates permanently blocked, guest confirmation email sent, Telegram message edited to show outcome, buttons removed.
- Reject: status becomes REJECTED, dates freed immediately, Telegram message edited.
- Both operations are idempotent -- tapping a button twice is harmless.

---

## Error Code Reference

| Code | Meaning |
|---|---|
| INVALID_DATE | Date string malformed or not a real calendar date |
| PAST_DATE | Check-in is before today |
| INVALID_RANGE | Check-out is not after check-in |
| MIN_NIGHTS | Fewer nights than configured minimum |
| MAX_GUESTS | Guests exceed configured maximum |
| INVALID_GUESTS | Guests is zero or non-numeric |
| INVALID_PHONE | Not a valid 10-digit Indian mobile |
| INVALID_EMAIL | Malformed email address |
| INVALID_UTR | UTR is not 8-22 alphanumeric characters |
| INVALID_EVENT_TYPE | eventType not in the allowed list |
| INVALID_ADDON | Unknown, inactive or unpriced add-on, or quantity outside 1..maxQty (message names the item) |
| MISSING_NAME | Name field is blank |
| MISSING_FIELD | A required field is absent |
| DATES_UNAVAILABLE | Selected dates overlap with an existing booking |
| HOLD_EXPIRED | The hold timed out before UTR was submitted |
| ALREADY_SUBMITTED | UTR already submitted for this booking |
| INVALID_STATUS | Operation not valid for the booking's current status |
| RATE_LIMITED | More than 3 HOLD attempts from same phone in one hour |
| HONEYPOT | Bot detected (honeypot field was filled) |
| LOCK_TIMEOUT | Server busy -- retry in a moment |
| FORBIDDEN | Telegram webhook called with wrong secret |
| BAD_JSON | POST body is not valid JSON |
| UNKNOWN_ACTION | action parameter not recognised |
| NOT_FOUND | Booking ID does not exist |
| SERVER_ERROR | Unhandled exception (check Log sheet for details) |

---

## Booking Status Lifecycle

```
createBooking  ->  HOLD  ->  (hold expires)  ->  EXPIRED
                    |
                    +->  submitPayment  ->  PAYMENT_SUBMITTED
                                                  |
                             +--------------------+--------------------+
                             v                                         v
                         CONFIRMED                               REJECTED
                    (dates blocked forever)               (dates freed immediately)
```

Staff can also manually set CANCELLED directly in the Bookings sheet for any booking.

---

## Data Sheets Reference

### Bookings sheet columns

| Column | Description |
|---|---|
| bookingId | Unique ID (BK-...) |
| createdAt | ISO 8601 timestamp |
| name | Guest full name |
| phone | Normalised 10-digit mobile |
| email | Optional -- used for confirmation email |
| guests | Number of guests |
| checkIn | YYYY-MM-DD (inclusive) |
| checkOut | YYYY-MM-DD (exclusive) |
| nights | Number of nights (computed) |
| amount | Total INR (computed server-side, never from client) |
| status | HOLD / PAYMENT_SUBMITTED / CONFIRMED / REJECTED / EXPIRED / CANCELLED |
| holdExpiresAt | ISO timestamp -- cleared after CONFIRMED |
| utr | Transaction reference from guest |
| confirmedAt | ISO timestamp -- set when staff confirms |
| notes | Guest notes |
| telegramMsgId | Telegram message ID used to edit the alert |
| bookingType, packageId, eventType, totalAmount, balanceAmount, lastReminderAt, reminderCount | v2 columns (Q to W) |
| addons | JSON list of priced add-on lines; blank on older rows |
| addonsTotal | Sum of add-on lines |
| baseTotal | Package total before add-ons (stays only) |

### Addons sheet

Created by `migrateSheets()` with three inactive `[TBD: ...]` rows. Columns are read by header name.

| Column | Value |
|---|---|
| id | Unique id used by the API, e.g. biryani |
| category | food / travel / car / other |
| name, description | Shown to guests |
| unit | flat / per_guest / per_night / per_qty |
| price | INR, plain text. Blank = "price on request", not bookable |
| maxQty | Highest quantity for per_qty items (default 10) |
| active | TRUE to show and allow booking |
| confirmRequired | TRUE marks the item "(to confirm)" in messages |
| slot, details | Optional image slot name and extra text for the website |
| order | Sort order in the list |

### Events sheet columns

| Column | Description |
|---|---|
| eventId | Unique ID (EV-...) |
| createdAt | ISO timestamp |
| name | Enquirer name |
| phone | Mobile |
| email | Optional |
| eventType | wedding / birthday / corporate / getaway / other |
| eventDate | Preferred date |
| guests | Expected headcount |
| notes | Details |
| status | NEW (staff updates manually) |

### Config sheet keys

| Key | Default | Description |
|---|---|---|
| weekdayRate | 5000 | INR per night (Sun-Thu) |
| weekendRate | 7000 | INR per night (Fri-Sat) |
| minNights | 2 | Minimum booking duration |
| maxGuests | 100 | Capacity cap |
| holdMinutesBeforePayment | 20 | Hold TTL before UTR submission |
| holdMinutesAfterPaymentSubmitted | 1440 | Hold TTL after UTR submitted (24 h) |
| upiId | nsgresort@upi | UPI VPA |
| payeeName | NSG Royal Resort | Shown in UPI app |
| resortName | NSG Royal Resort | Used in emails and Telegram |
| notifyOnNewHold | false | true = alert on every new HOLD |
| timezone | Asia/Kolkata | Informational only |
| maxActiveHolds | 15 | Max active HOLD rows allowed |
| reminderMinutes | 30 | Minutes between reminder attempts |
| reminderMaxCount | 12 | Max reminders per booking |
| reminderQuietStartHour | 23 | Quiet hours start (hour 0-23) |
| reminderQuietEndHour | 7 | Quiet hours end (hour 0-23) |
| resortAddress | Nidigattu, Bheemunipatnam, Bheemili | Resort address |
| checkInTime | 15:00 | Check-in time |
| checkOutTime | 11:00 | Check-out time |
| cancellationPolicy | Free cancellation up to 48 hours before check-in. | Cancellation policy |
| pkgWholeName | Whole Resort | Whole package display name |
| pkgWholeWeekdayRate | 40000 | Whole package weekday rate |
| pkgWholeWeekendRate | 50000 | Whole package weekend rate |
| pkgWholeAdvance | 10000 | Whole package advance |
| pkgWholeMaxGuests | 100 | Whole package max guests |
| pkgPentName | Penthouse + Pool, Turf & Garden | Penthouse package display name |
| pkgPentWeekdayRate | 15000 | Penthouse weekday rate |
| pkgPentWeekendRate | 20000 | Penthouse weekend rate |
| pkgPentAdvance | 5000 | Penthouse advance |
| pkgPentMaxGuests | 20 | Penthouse max guests |
| eventAdvance_wedding | 10000 | Event advance - wedding |
| eventAdvance_birthday | 5000 | Event advance - birthday |
| eventAdvance_corporate | 5000 | Event advance - corporate |
| eventAdvance_other | 2000 | Event advance - other |

### ManualBlocks sheet

Staff add rows to block specific dates:

| Column | Value |
|---|---|
| blockId | Any unique string |
| blockDate | YYYY-MM-DD |
| reason | e.g. Maintenance, Private event |
| createdAt | Date added |

### Log sheet

Every INFO/WARN/ERROR is appended automatically:

| Column | Value |
|---|---|
| timestamp | When it happened |
| level | INFO / WARN / ERROR |
| action | Function that logged it |
| detail | Human-readable message |

---

## Known Limitations

| Limitation | Detail |
|---|---|
| Apps Script execution time | Max 6 minutes per call; web app calls normally finish in under 3 s |
| MailApp daily quota | 100 emails/day on personal Gmail; 1,500/day on Google Workspace |
| UrlFetchApp quota | 20,000 calls/day |
| Spreadsheet throughput | Suitable for up to ~100 concurrent users; each write acquires a global lock |
| No real-time push | Availability calendar must be polled; Apps Script has no WebSocket support |
| Cold starts | First request after inactivity can take 2-4 s |
| No custom CORS headers | Frontend must use Content-Type: text/plain for POST to avoid preflight |
| Telegram message editing | Telegram does not allow editing messages older than 48 hours |
| Rate limiter accuracy | CacheService is script-wide; under extreme concurrency limits may be slightly inaccurate |
| WhatsApp not implemented | sendGuestWhatsApp() is a stub -- logs only until a provider is plugged in |
| No payment gateway | UPI payments are verified manually by staff |
| Single US-region deployment | Expect 200-400 ms additional latency from India |

---

## Plugging in WhatsApp Later

Find `sendGuestWhatsApp` in `Code.gs`. Replace the logEntry call with a `UrlFetchApp.fetch()` to your provider (Interakt, Wati, Gupshup, or Meta Cloud API). The phone is already normalised to 10 digits -- prepend +91 for international format.

---

## Re-deploying After Code Changes

```
Apps Script editor
  -> Deploy
  -> Manage deployments
  -> Edit (pencil icon) on the current deployment
  -> Version: "New version"
  -> Deploy
```

The URL stays the same. No changes needed on the frontend.

---

*Built for NSG Royal Resort, Bheemili, Andhra Pradesh, India.*
