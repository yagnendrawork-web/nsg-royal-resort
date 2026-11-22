# NSG Royal Resort: handoff

Read this before changing anything. [README.md](README.md) explains everyday use (commands, photos, text, Sheet, deploy). [SPEC.md](SPEC.md) is the original design spec, and [docs/api.md](docs/api.md) is the backend contract (it wins where SPEC disagrees).

## Status (2026-11-18: launch candidate, cleanup done)

**Built and working**
- Public pages: Home, Stay, Amenities, Dining (food packages + full Aroma menu), Events (group sizes, enquiry form), Gallery (photos + self-hosted video), Cars (feature flag), Contact, Policies, 404.
- Booking flow: `book.html` (stay or event, package cards, availability calendar, live quote, add-ons, guest details, UPI advance with QR / UPI button / UTR) and `status.html` (lookup + printable "Booking confirmation").
- Guest pay-link page `pay.html` and staff app `staff.html` (PIN login, bookings calendar, create/edit pay links, confirm/reject, balances, block dates, review requests). Both are noindex, kept out of the sitemap, and linked from nowhere.
- Light/dark theme, branded loaders and placeholders, reviews strip/card/ribbon (shown only when approved reviews exist).
- Production build: mock code stripped, CSS minified, CSS/JS links versioned (`?v=<hash>`), styleguide excluded, `_headers` (7-day cache for assets, no-cache for pages, security headers) and `_redirects` (old Hostinger URLs) emitted, launch check.

**Flags (`content/config.json`)**

| Key | Value now | Meaning |
|---|---|---|
| `USE_MOCK` | `false` | Live API. `true` is for local testing only, and the launch check blocks it |
| `API_URL` | live Apps Script `/exec` URL | Backend web app |
| `SITE_URL` | `[TBD: SITE_URL]` | **Must be set** (e.g. `https://www.nsgroyalresort.in`) for the sitemap and robots.txt; launch is blocked until it is |
| `PHONE` / `WHATSAPP` | `+917013566993` / `917013566993` | All call and WhatsApp links |
| `FEATURES.cars` | `true` | Cars page and its nav/footer links. If set to `false`, the page is not built and `/cars.html` redirects to Stay |
| `FEATURES.offers` | `true` | No effect: the offers bar was never wired up and its code was removed in the launch cleanup |
| `PAYMENT_MODE` | `upi` | `gateway` is a stub only |
| `TURNSTILE_SITE_KEY` | empty | Cloudflare Turnstile is off; it loads only when a key is set |

**Where data lives**
- Website text: `content/site.json`. Settings: `content/config.json`. Photo registry: `tools/slots.json`. Source photos: `originals/` (not in Git; backed up on Google Drive).
- Packages, prices, add-ons, reviews, blocked dates, bookings, staff and backend settings: the Google Sheet (tabs Packages, Addons, Reviews, Config, ManualBlocks, Bookings, Staff), read through Apps Script.
- Secrets: Apps Script Script Properties only (never in this repo).

**Before go-live** (`npm run launch` currently lists these): set `SITE_URL`; replace the `[TBD: …]` items still on the site (event inclusions, capacities and advances, `[TBD: confirm hours]`, `[TBD: X hours]`, `[TBD: event name]`, directions and parking); in the Sheet, set `payPageUrl` and run **NSG → Launch check**. See CONTENT.md for every placeholder, and CLEANUP.md for what the launch cleanup removed or kept.

## Guards (rules for every change)

- **Never invent facts:** prices, ratings, reviews, capacities, amenity details, policy text, phone numbers, URLs. Unknown → an obvious `[TBD: …]` in `content/site.json`, logged in CONTENT.md. The launch check blocks publishing while one is visible.
- Plain HTML/CSS/JS, classic `defer` scripts under `window.NSG`, no inline handlers, no frameworks, bundlers or runtime npm packages. Dev-only tools (sharp, qrcode-generator) are fine.
- Each page loads only the scripts it uses. Home JS budget is under 60 KB (Home loads packages, gallery and reviews lazily).
- `api.js` is the only file that knows raw response shapes. Every call resolves (never throws) with `{ ok, data }` or `{ ok: false, code, error }`, with timeouts. Mock code stays inside `/* MOCK:START */ … /* MOCK:END */` lines so `--prod` can strip it; the build fails if the markers are unbalanced.
- All colours, radii and fonts go through `tokens.css` (light and dark values). Print stays light.
- Copy lives in `site.json` (`ui.*` for script messages), never hard-coded in JS or HTML.
- Every photo is a slot in `tools/slots.json` with alt text and reserved dimensions (no layout shift). Each page's header banner is a `priority` slot with `{{preload:…}}` in `<head>`; all other images are lazy.
- One H1 per page; `pay`, `staff`, `status` and `404` stay `noindex` and out of the sitemap; `pay`/`staff` are never linked. `npm run check` enforces these.
- Booking scripts (`book.js`, `calendar.js`, `payment.js`, `status.js`) look up fixed element IDs; check.js fails if one disappears. Don't rename them.
- Don't put anything secret in `content/config.json`: it's shipped to every browser.

## Business rules

- Stays and events (events are the focus). Packages and their rates, advances, guest limits and inclusions come only from the Sheet's Packages tab. **Only one package can be booked for a given date** (one calendar for the property).
- Online payment is an **advance only**, by UPI. The balance is paid at the resort. Balance = total − advance received (or agreed advance until confirmed); total = base + extra-guest charge + add-ons, or a staff special price.
- A website booking is a **HOLD** until the guest submits a UTR and staff confirm it. Unpaid holds expire. Staff pay links hold dates for `linkHoldHours` (6/12/24/48 h, can be extended or revived).
- Calendar: check-in may not be a blocked night; a stay may not contain a blocked night; the check-out day may be blocked; minimum nights come from the backend. Dates are `YYYY-MM-DD` strings in Asia/Kolkata.
- Phone numbers are Indian 10-digit mobiles. Events booked on the website are enquiry-first (event types and advances from the backend).
- Add-ons (food, travel, car) are priced by the server from the Addons tab; `price` blank means "price on request". Food packages respect `minQty`/`maxQty`.
- Car rental: partner vehicles, self-drive, no driver; prices only on WhatsApp/enquiry.
- Reviews appear only when `approved` is TRUE in the Reviews tab; nothing renders without approved reviews.
- The printable page is a "Booking confirmation", never an "invoice" or "tax invoice".
- Check-in/out times shown to guests must match the Config tab (site copy says check-in 11 AM, check-out 10 AM).
