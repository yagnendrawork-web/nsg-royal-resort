# NSG Royal Resort website

The public website, guest pay page and staff app for **NSG Royal Resort** (Nidigattu, Bheemunipatnam, Bheemili). Guests browse the resort, check live prices, pick dates and pay a small **advance by UPI**. Staff confirm bookings from a phone app or Telegram.

- **Front end (this repo):** plain HTML, CSS and JavaScript. No framework and no runtime packages. A small Node build (`tools/build.js`) turns the templates in `src/` into the finished site in `dist/`.
- **Back end (separate repo `nsg-resort-backend`):** one Google Apps Script web app on top of a Google Sheet. The full API is in [docs/api.md](docs/api.md).
- **Hosting:** Cloudflare Pages, built from GitHub on every push.

For launch day, DNS and emergencies, follow [docs/GO-LIVE-PLAYBOOK.md](docs/GO-LIVE-PLAYBOOK.md). Rules for changing the code are in [HANDOFF.md](HANDOFF.md) and [SPEC.md](SPEC.md).

## Folder map

| Path | What it is |
|---|---|
| `src/*.html` | Page templates: index, stay, amenities, dining, events, gallery, cars, book, status, contact, policies, 404, pay (guest pay link), staff (staff app), styleguide (dev only) |
| `src/partials/` | Shared pieces inserted with `{{include:name}}`: header, footer, sticky bar, lightbox, loaders, services, icons |
| `src/css/` | `tokens.css` (colours, fonts, spacing, light/dark theme), `base.css`, `components.css`, `pages.css`, `print.css` |
| `src/js/` | One small script per job. `api.js` is the only file that talks to the backend; `api.link.js` adds the pay-page and staff calls |
| `src/assets/img/` | Generated photos (`<slot>-480/960/1600.webp`) and `manifest.js`. Don't edit by hand: use `npm run images` |
| `src/assets/` | Fonts, the Aroma menu data, the event video, the staff app manifest |
| `src/_headers`, `src/_redirects` | Cloudflare caching/security headers and old-URL redirects (copied to `dist/`) |
| `content/site.json` | **All website text**, grouped by page, plus SEO titles and the `ui` messages used by scripts |
| `content/config.json` | Settings: API_URL, SITE_URL, PHONE, WHATSAPP, TURNSTILE_SITE_KEY, FEATURES, PAYMENT_MODE, USE_MOCK |
| `tools/` | `build.js` (build, dev server, launch check), `check.js` (output checks), `images.js` (photo resizing), `slots.json` (photo registry), `verify-staff.js`, `youtube.js` |
| `originals/` | Your full-size source photos. **Not in Git** (too large); keep the Google Drive copy up to date |
| `dist/` | Build output: what Cloudflare publishes. Not in Git; rebuilt every time |
| `docs/` | API reference and go-live playbook |
| `backend/` | Reference copy of the Apps Script code (the live code runs in Apps Script) |
| `SPEC.md`, `HANDOFF.md`, `PROGRESS.md`, `CONTENT.md`, `CLEANUP.md` | Design spec, rules for future changes, work log, placeholder log, launch cleanup log |

## Commands

You need Node.js 20 or newer.

| Command | What it does |
|---|---|
| `npm install` | One time: installs the two dev tools (sharp for photos, a QR library) |
| `npm run images` | Turns photos in `originals/` into web sizes in `src/assets/img/` and rewrites `manifest.js` |
| `npm run build` | Builds `dist/` for testing (keeps the mock data and the styleguide) |
| `npm run build:prod` | Production build: removes mock code and dev pages, minifies CSS, versions CSS/JS links |
| `npm run dev` | Builds, rebuilds on every save, and serves the site at http://localhost:3000 |
| `npm run check` | Checks `dist/`: broken links, missing photos, one H1 per page, private pages hidden, booking-script IDs present |
| `npm run launch` | What Cloudflare runs: production build **plus the launch check**, then `check`. Fails with a numbered list while anything is unfinished |

**Launch check** (`node tools/build.js --prod --launch`) refuses to publish while any of these is true: a `[TBD: …]` or `[MISSING: …]` is still visible on the site; `USE_MOCK` is true; `API_URL` is empty or not an Apps Script `/exec` URL; `PHONE`, `WHATSAPP` or `SITE_URL` is empty or a placeholder; a review name starts with "Sample" (in site.json or the live Reviews feed). It also reminds you that `payPageUrl` in the Sheet's Config tab must point at the live `/pay.html`, because the website can't read that value.

**Testing with fake data:** set `"USE_MOCK": true` in `content/config.json` and run `npm run dev`. The site then uses built-in mock packages, dates and bookings (staff PIN `246810`, pay page `pay.html?t=DEMO`). On the pay and staff pages, `?mock=1` does the same for one visit. Production builds strip all mock code, so these switches do nothing on the live site. Set `USE_MOCK` back to `false` before you commit.

## How to add or change photos

Every photo position on the site is a named **slot** listed in `tools/slots.json` (ratio, crop focus, alt text). Examples: `banner-stay` (Stay page header), `banner-events` (Home header), `pkg-whole` (package card for the package with id `whole`), `gallery-01` … `gallery-30`, `food-biryani` (add-on photo), `car-audi-a6`.

1. Save the photo in `originals/` named after the slot, e.g. `originals/banner-dining.jpg` (`.jpg`, `.jpeg`, `.png` or `.webp`).
2. Run `npm run images`. It prints a filled/missing table.
3. Run `npm run dev` and look at the page. Add `?slots=1` to any URL to see every slot name on the page.
4. Update the slot's `alt` text in `tools/slots.json` if the photo changed, then commit and push.

To show one photo in two places without a second file, give a slot `"use": "<other-slot>"` in `slots.json`. A new add-on in the Sheet can show a photo by putting a slot name in its `slot` column (that slot must have a photo).

Photos and CSS/JS are cached by browsers for 7 days. CSS and JS links change automatically when their content changes, but a **replaced photo with the same slot name** can show the old version to returning visitors for up to a week.

## How to change text

All visible text is in `content/site.json`, grouped by page (`home`, `stay`, `events`, `dining`, `policiesPage`, …) plus `seo` (page titles and descriptions) and `ui` (messages shown by scripts, such as booking errors). Edit the value, run `npm run dev` to check, then commit and push. Unknown facts are written as `[TBD: …]` and listed in `CONTENT.md`; the launch check blocks publishing until they are replaced.

Phone and WhatsApp numbers, the website address and feature switches are in `content/config.json`. `FEATURES.cars` shows or hides the Cars page and its links.

## Prices, packages, add-ons and reviews (Google Sheet)

These are **not** in this repo. They come live from the Google Sheet through the Apps Script API, so changes show on the website without a deploy.

| Sheet tab | Controls | When the website updates |
|---|---|---|
| **Packages** | Package names, rates (weekday/weekend), advance, guests, extra-guest fee, bedrooms, what's included, order, `active`, `popular` | Within 5 minutes, or at once with **NSG → Refresh packages** (visitors' browsers may show the previous prices for a moment while the fresh copy loads) |
| **Addons** | Food packages, travel and car extras: `id, category (food/travel/car/…), name, description, unit (flat/per_guest/per_night/per_qty), price, minQty, maxQty, active, confirmRequired, slot, details, order` | Within 5 minutes |
| **Reviews** | Guest reviews: set `approved` to TRUE to publish, `featured` to TRUE to pin | Within 10 minutes |
| **Config** | UPI ID and payee name, check-in/out times, cancellation policy, minimum nights, hold times, `payPageUrl`, Google rating, review count and links, reminder timing | Within a few minutes (some values are cached with the package info) |
| **ManualBlocks** | Dates blocked by staff (also via the staff app or Telegram `/block`) | Within a few minutes |
| **Bookings**, **Staff** | Booking records; staff names and PIN hashes (set PINs with **Staff → Set staff PIN…**) | n/a |

Column details and rules: [docs/api.md](docs/api.md), section "Sheets".

## Deploying

Cloudflare Pages is connected to the GitHub repo (`main` branch) with:

- Build command: `npm run launch`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION` = `20`

To publish a change:

```
npm run build && npm run check     # optional local check first
git add .
git commit -m "What I changed"
git push
```

Cloudflare builds and publishes in about a minute. If the build fails, open the deployment log in Cloudflare: the launch check lists every problem as a numbered line. Fix them and push again. The live site stays on the last good version until a build passes.

## Rolling back

- **Website:** Cloudflare dashboard → Workers & Pages → the project → **Deployments** → pick the last good deployment → **Rollback**. Then fix the code and push again. (Or `git revert` the bad commit and push.)
- **Backend:** Apps Script → **Deploy → Manage deployments** → pencil → choose the previous version → **Deploy**.
- **Sheet data:** File → Version history in Google Sheets.

## Secrets

Secrets **never** go in this repo or in `content/config.json` (everything in `config.json` is public; it's sent to every visitor). They live in **Apps Script → Project Settings → Script Properties**: `BOT_TOKEN`, `ALLOWED_CHAT_IDS`, `WEBHOOK_SECRET`, `WEB_APP_URL`, `STAFF_PEPPER`, and `TURNSTILE_SECRET` if Turnstile is used. Staff PINs are stored only as hashes in the Staff tab. Before pushing, you can run the check from the playbook:

```
git grep -n -i -E "bot[0-9]{6,}|AAF|BOT_TOKEN.*:|pepper.*=|secret.*="
```

It should print nothing, or only variable names.
