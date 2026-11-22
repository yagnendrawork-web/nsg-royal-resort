# Launch cleanup log (CLEANUP.md)

Task: launch cleanup, optimisation and handover (2026-11-18). Stage 1 is the inventory (nothing changed). Later stages record what was actually removed or changed, and why some items were kept.

Method: every file in `src/` was matched by name against all pages, partials, scripts, CSS, `content/*.json` and `tools/`. Images were also matched against the built `dist/` HTML/CSS/JS and `src/assets/img/manifest.js`. **Any slot listed in the manifest counts as referenced**, because the Google Sheet can name any slot at runtime (Addons `slot` column, package photos via `pkg-<id>`, services `photoSlot`). CSS classes count as alive if the name appears anywhere in `src` HTML/JS, `content/site.json`, `aroma-menu.json` or `tools/build.js`, or starts with a prefix that code builds dynamically (`'sf-cal-' + x`, `` `st--${x}` ``, `video-feature--{{.orient}}`, …).

## Stage 1: Inventory

### (a) Source files not referenced by any page, partial, script or the build

| File | Size | Notes |
|---|---|---|
| `src/assets/img/logo.jpeg` | 42,856 B | Never referenced (pages use `logo-md.png` / `logo.png`). |
| `src/assets/img/gallery-19-960..textClipping` | 227 B | macOS text-clipping file dropped into the folder by accident. |
| `src/partials/offers-bar.html` | 590 B | Not included by any page (see b). |
| `src/assets/fonts/inter-300.woff2` | 23,916 B | Declared in `tokens.css`, but no CSS rule asks for weight 300. |
| `src/assets/fonts/inter-v20-latin-500italic.woff2` | 25,636 B | Declared in `tokens.css`; every `font-style: italic` rule is on Cormorant (heading font), and every JS-built `<em>`/`<i>` is styled `font-style: normal` or is an empty dot. No Inter italic text exists. |
| `docs/src/assets/fonts/*.woff2` (6 files) | 144,548 B | Byte-identical copies of `src/assets/fonts`, committed under `docs/`. Not used by anything. |
| `dist/js/cars.js`, `dist/js/api.link.js.tmp.*` | 2,700 B + 0 B | Stale build output: `src/js/cars.js` was removed earlier, but the build never cleaned `dist/css` or `dist/js`. |

All other files are referenced. Images that are on no page but are in the manifest ("manifest-only", kept as runtime-reachable): `hero-480/960` (the Home hero now uses `banner-events`), `car-01*`, `car-02*` (old Audi Q5 / Mercedes cards), `amenity-bar*`, `amenity-fridge*`, `amenity-extra*`, `pkg-whole-rooms*`, `penthouse-lounge*`, `food-01..08*`, `food-biryani/starters/desserts*` (menu.js and add-ons pick these by name).

### (b) Removed or disabled features still in the code

| Item | Where | Status |
|---|---|---|
| Offers bar | `partials/offers-bar.html`, `.offers-*` rules in `components.css` (~1.9 KB) and `print.css`, empty "4. GET offers" header in `api.js`, `site.json offers.default` | Never wired up: no page includes the partial, and there is no offers JS or API call. `FEATURES.offers: true` in config.json has no effect. |
| Cars page | `src/cars.html`, `FEATURES.cars: true` | **Live**, not removed: the page is emitted and linked from the nav and footer. But `src/_redirects` still has `/cars.html /stay.html#car-rental 301` from when it was off. On Cloudflare Pages a redirect rule wins over a real file, so the live Cars page is unreachable. Also, `stay.html` no longer has `#car-rental`. |
| Old two-package code paths | n/a | Already removed (PROGRESS "Three packages + theme"): no `[data-pkg]` price code or `fallbackPrice` reads remain. Only `site.json` copy keys remain (see below). |
| Old `cars.js` / car section on Stay | `dist/js/cars.js` only | Source removed earlier; a stale copy remains in dist (see a). |
| Styleguide-only code | 23 selectors in `components.css` (`.card-car*`, `.card-review*`, `.accordion*`, `.calendar-card`, `.calendar-header`) | Used only by `styleguide.html` (dev only, kept). |
| Demo slots | `styleguide.html` slot demos; unused `slots.json` entries (`car-01..12`, `hero`, …) | `tools/` is kept as instructed. |
| Old test page | none | No test/demo HTML page exists in `src/`. `?mock=1` (pay/staff) and `?mockreviews=1` are mock switches inside `api.js` / `api.link.js`. |
| Mock layer | `api.js` (mock bookings, blocks, `MOCK_INFO`, `MOCK_ADDONS`, mock branches in every call, `mockReviews`) and `api.link.js` (~460-line staff/pay mock section) | Needed for local testing. Shipped to production today (~27 KB of the 69 KB in these two files). |
| Unused `site.json` copy | e.g. `cars.known`, `copy.cars`, `stay.cars*`, `stay.houseRules*`, `events.spaces*`, `events.packages*`, `book.step*Title`, `home.trust`, `home.amenities`, `policies.*` (old placeholders) | Content file: left untouched (copy is out of scope). Not shipped: the build only reads the keys templates use, and only `ui.*` goes to the browser. |

### (c) Dead CSS selectors (no match in any src HTML, JS, content or build output)

| File | Rules | Fully dead rules | Bytes | Dead classes |
|---|---|---|---|---|
| `base.css` | 37 | 3 | 222 | `bg-emerald` |
| `components.css` | 520 | 16 (+14 rules with some dead selectors) | 1,441 | `bg-emerald capacity-card card-event card-event-body card-event-desc card-event-media card-event-title food-card-price photo-band slot-frame step-card` |
| `pages.css` | 1,133 | 150 (+12 partly) | 14,506 | `am-*` (old amenities page: `am-badge am-bento am-card* am-cars-* am-detail am-final-inner am-hairline-left am-icon am-lead am-road am-split*`), `capacity-*`, `car-actions car-availability car-credit car-desc car-details`, `card-event-*`, `cta-wrap`, `dining-intro-inner`, `event-inclusions events-grid`, `food-card* food-cards food-empty food-photo* food-photos`, `gallery-cta-wrapper`, `menu-chip(s) menu-item* menu-list menu-section* menu-soon` (old menu, replaced by `aroma-menu-*`), `photo-band*`, `rate-val--request`, `ribbon-list ribbon-track ribbon-viewport`, `rules-list`, `step-card step-desc step-num step-title steps-grid`, `trust-*`, `veg-mark veg-text*` |
| `print.css` | 14 | 0 (1 partly) | n/a | `status-form-section` |
| `tokens.css` | 2 | 0 | 0 | n/a |

Total: about 16.2 KB of fully dead rules, plus dead selectors inside 27 shared selector lists. The 20 sample classes checked by hand appear nowhere outside CSS.

### (d) console.log / debug code

None. `src/js` has no `console.log`, `console.debug`, `console.table` or `debugger`. (`tools/*.js` log on purpose; they are CLI scripts.)

### (e) Duplicated helpers and duplicated files

| Item | Copies | Notes |
|---|---|---|
| `esc()` HTML escaper | 8: addons, food-packages, menu, packages, pay, reviews, services, staff | One line each. Merging would make each page depend on a shared file, so they stay separate. |
| `inr()` rupee formatter | 7: addons, api.link, book, food-packages, packages, pay, staff | Same reason. |
| `cleanPhone()` | 4: site.js (×2), api.link, book | Rules differ slightly per caller (form validation vs API). |
| `addDays()` / date helpers | api.js, calendar.js, staff.js | calendar.js is standalone by design (book page + staff). |
| Byte-identical images | 70 file pairs (e.g. `banner-events-*` = `gallery-02-*`, `amenity-dining-*` = `banner-dining-*` = `gallery-10-*`, `hero-*` = `amenity-pool-*` = `gallery-03-*`, `car-01-*` = `amenity-cars-*`) | One photo used under two slot names. Merging them with slots.json `"use"` would let browsers reuse the cached file across pages, but it changes image URLs and `tools/`, so it's left as a follow-up. |

### Performance findings (for Stage 3)

- **Seven pages lazy-load their LCP hero banner** with no preload: amenities, cars, contact, dining, events, gallery, policies. Only index, book, stay and status preload theirs.
- `renderPreload()` in `build.js` ignores slots.json `"use"`, so preloading `banner-cars` (which reuses `amenity-cars`) would output nothing.
- The header logo (every page) has no `loading`/`decoding`. `NSG.img()` output has no width/height (its frames reserve 4:3 with `aspect-ratio`, so there's no layout shift).
- All pages load all five CSS files (230 KB raw, render-blocking); there's no minification.
- `dist/` is never cleaned, so stale files ship.
- Images over 200 KB in dist: `amenity-gardens-1600.webp` / `gallery-11-1600.webp` (331 KB), `amenity-dining-1600` / `banner-dining-1600` / `gallery-10-1600` (247 KB), `assets/videos/event-highlight.jpg` (327 KB poster), `assets/videos/event-highlight.mp4` (13.8 MB, self-hosted video, `preload="none"`).

## Stage 2: Safe removal (done)

### Deleted files (git rm; restore with `git checkout HEAD~1 -- <path>` after the cleanup commit)

| File | Bytes |
|---|---|
| `src/assets/fonts/inter-v20-latin-500italic.woff2` (and its `@font-face` in `tokens.css`) | 25,636 |
| `src/assets/fonts/inter-300.woff2` (and its `@font-face` in `tokens.css`) | 23,916 |
| `src/assets/img/logo.jpeg` | 42,856 |
| `src/partials/offers-bar.html` | 590 |
| `src/assets/img/gallery-19-960..textClipping` | 227 |
| **Total** | **93,225** |

### Removed code

- **Dead CSS:** 199 whole rules (plus 18 `@media` blocks left empty and the 4 orphaned keyframes `ribbonScroll amFloat amWiggle amRoad`) and dead selectors trimmed from 27 shared selector lists, in `base.css`, `components.css`, `pages.css` and `print.css`. This includes all `.offers-*` rules. CSS source went from 238,599 to 216,762 bytes (−21,837). Styleguide-only selectors (`.card-car`, `.card-review`, `.accordion`, `.calendar-card`) were kept because styleguide.html is kept.
- The empty "4. GET offers" section header in `api.js`.
- `console.log`: none to remove.

### Production-only exclusions (`node tools/build.js --prod`; dev builds unchanged)

- **Mock layer:** `api.js` and `api.link.js` mark mock data and mock branches with `/* MOCK:START */ … /* MOCK:END */` lines (13 blocks in api.js, 4 in api.link.js). `build.js` `stripMockBlocks()` removes them in `--prod` and fails the build if the markers are unbalanced or the result does not parse. Shipped sizes: api.js 34.4 → 18.7 KB, api.link.js 34.6 → 7.4 KB. In production, `?mock=1` and `?mockreviews=1` have no effect. `api._mock.today/addDays` stay: live pay/staff code uses them.
- **Dev pages:** `styleguide.html` and any `test*`/`demo*` page are not emitted. The footer's "Design Styleguide" link is wrapped in a new `<!--dev-->…<!--/dev-->` block, so production has no broken link to it.
- **Source maps:** any `*.map` in dist is deleted (none are generated today).
- **Unreferenced images:** `pruneUnusedImages()` deletes dist images whose file name appears in no dist HTML/CSS/JS/JSON and whose slot is not in `manifest.js`. Nothing qualifies after the deletions above; it guards future additions.
- **Stale output:** the build now starts from an empty `dist/` (this replaced the old image/page-only stale cleanup), so `dist/js/cars.js` and the `.tmp` file are gone.

### Kept on purpose

- `docs/src/assets/fonts/*` (144.5 KB duplicate fonts): `docs/` is on the keep list. Safe to delete by hand.
- The 70 duplicate image pairs, the `esc`/`inr` copies, and the unused `site.json` keys: see Stage 1 (e).
- "Manifest-only" images (`hero-*`, `car-01/02-*`, `amenity-bar/fridge/extra-*`, …): the Sheet can reference any manifest slot.
- `FEATURES.offers` in `config.json`: config values are out of scope. The flag currently does nothing.

## Stage 3: Performance (done)

- **LCP banner on every page:** all `banner-*` slots are `priority` in `tools/slots.json`; amenities, cars, contact, dining, events, gallery and policies gained `{{preload:…}}` (index, book, stay and status had it). Priority images render `loading="eager" fetchpriority="high"`; all other slot images stay `loading="lazy" decoding="async"`. `renderPreload()` now honours `"use"` (cars' banner reuses `amenity-cars`) and points `href` at the same 960 w file as the `<img>`.
- **Image attributes:** the header logo got `loading="eager" decoding="async"` (above the fold), the lightbox `<img>` `decoding="async"` (its size comes from the photo it shows), the staff PIN logo `decoding="async"`, and `NSG.img()` output `width="1200" height="900"` (every caller's frame is 4:3 and the image fills it, so layout is unchanged).
- **Images over 200 KB in dist (not changed; re-encoding is content work):** `assets/videos/event-highlight.mp4` 13.8 MB (`preload="none"`, loads on demand), its poster `event-highlight.jpg` 327 KB (worth recompressing to ~100 KB), `amenity-gardens-1600` = `gallery-11-1600` 331 KB, `amenity-dining-1600` = `banner-dining-1600` = `gallery-10-1600` 247 KB (1600 w files are only fetched by wide or high-DPR screens).
- **Fonts:** four faces declared, all used (Cormorant 400/600, Inter 500/600; Inter 400 text resolves to the 500 face, as before). Two preloaded (Cormorant 600, Inter 600). All `font-display: swap`.
- **Scripts:** every page script is `defer`. The only inline script is the 447-byte theme snippet in `<head>`. `api.js` was removed from 404, cars, gallery and policies (nothing on those pages calls the API).
- **Minify (`--prod`):** dependency-free CSS minifier in `build.js` (comments and whitespace only; strings, `url()`, combinators, `calc()` and media-query spacing kept). Prod CSS 216.7 → 172.2 KB. JS is left as `trimDistJs` already leaves it (comment lines and indentation removed); a real JS minifier would need a dependency.
- **Cache-safe deploys:** in `--prod`, every `css/*.css`, `js/*.js` and `manifest.js` reference (`href`, `src`, `data-lazy-script`) gets `?v=<content hash>`, so the 7-day cache never mixes new HTML with old CSS/JS/config.
- **Cloudflare files:** `src/_headers` → `dist/_headers` (all paths: `Cache-Control: no-cache`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `/assets/*`, `/css/*`, `/js/*` swap to `public, max-age=604800` using `! Cache-Control`, because Cloudflare joins repeated headers with a comma). `src/_redirects` holds all seven requested rules. **`build.js` leaves out any rule whose source is a page it emits** and prints them: today `/amenities`, `/gallery`, `/contact` and `/cars.html`. Cloudflare follows a redirect even when the page exists, and already serves `gallery.html` at `/gallery` (redirecting `/gallery.html` there), so those rules would cause redirect loops (`/gallery`, `/contact`) or hide live pages (`/amenities`, and `/cars.html` while `FEATURES.cars` is true). Old `/amenities`, `/gallery` and `/contact` links still work: they now serve the matching new pages. `/blogs`, `/blog` and `/home` → `/` are emitted.

### Per-page weight: HTML + render CSS + page scripts + 2 preloaded fonts (raw bytes, before → after `--prod`)

| Page | Before | After | Hero image (now preloaded) |
|---|---|---|---|
| index | 390.5 KB | 311.5 KB | banner-events 104.3 KB |
| stay | 372.3 | 293.2 | banner-stay 95.5 |
| amenities | 411.5 | 332.7 | banner-amenities 58.9 |
| dining | 381.9 | 303.1 | banner-dining 92.8 |
| events | 430.3 | 351.6 | banner-celebrations 90.5 |
| gallery | 377.2 | 280.1 | banner-gallery 116.4 |
| cars | 358.6 | 261.5 | amenity-cars 58.2 |
| contact | 354.3 | 275.5 | banner-contact 72.0 |
| policies | 363.6 | 266.4 | banner-contact 72.0 |
| book | 432.3 | 353.2 | banner-stay 95.5 |
| status | 356.3 | 277.2 | banner-stay 95.5 |
| pay | 423.6 | 318.0 | none |
| staff | 420.6 | 315.0 | none |
| 404 | 348.6 | 251.2 | none |

CSS is 230.2 → 166.3 KB on every page. Shipped JS dropped by 15–42 KB per page (mock code; api.js off four pages). Home JS is 52.5 KB (budget 60 KB). Cloudflare also serves text compressed. The hero image bytes are the same file as before; before, seven pages loaded it lazily (late), and now it is preloaded.

## Stage 4: Launch safety (done)

- `node tools/build.js --prod --launch` (= the first half of `npm run launch`) prints a numbered list and exits 1 when: a `[TBD…]`/`[MISSING:…]` is in any shipped HTML/XML/TXT/JSON or `config.js`/`content.ui.js`; `USE_MOCK` is true; `API_URL` is empty, a placeholder or not an Apps Script `/exec` URL; `PHONE`/`WHATSAPP`/`SITE_URL` is empty or a placeholder (or SITE_URL is not https); a review `name` starts with "Sample" (site.json, and the live Reviews feed when reachable; unreachable is a warning). `payPageUrl` is in the Sheet's Config tab, which the website can't read, so it prints a reminder to run **NSG → Launch check** in the Sheet. Each rule was tested by temporarily breaking config.json/site.json (restored byte-for-byte).
- `package.json`: `"launch": "node tools/build.js --prod --launch && node tools/check.js"` (`check:launch` kept).
- `.gitignore` already had `node_modules/ dist/ originals/ .DS_Store *.log`.
- noindex: pay, staff (`noindex, nofollow`), status, 404 (`noindex`). check.js now enforces noindex + "not in sitemap" for all four, and keeps styleguide out of the sitemap.
- Sitemap: only the 10 public pages, on `SITE_URL`, as the final extension-less URLs (`/stay`, not `/stay.html`); 404 and styleguide removed. The invented fallback domain (`https://nsgroyalresort.com`) is gone: without SITE_URL no sitemap is written and robots.txt has no Sitemap line.

## Stage 5: Docs (done)

- `README.md` (new): project, folder map, commands, photos/slots, text, Sheet tabs, deploy, rollback, secrets.
- `HANDOFF.md` (new, it did not exist): Status, flags and data locations, plus the guards and business rules collected from SPEC.md, docs/api.md and PROGRESS.md.
