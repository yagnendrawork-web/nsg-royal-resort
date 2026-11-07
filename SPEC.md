# NSG ROYAL RESORT: FRONTEND SPEC (single source of truth)
Read once per task. Where silent, choose the simplest option and note it in the report.

## 1. Goal and hard rules
- Fast, classy, mobile-first site for a resort in Bheemili, India: stays and events (events are the focus). Most visitors arrive from Instagram's in-app browser on phones.
- Plain HTML/CSS/JS. No frameworks, no bundlers, no runtime npm dependencies. Dev-only dependency allowed: sharp. English only.
- NEVER invent facts: prices, ratings, reviews, amenity details, policy text, phone numbers, URLs. Unknown = obvious placeholder like "[TBD: cancellation policy]" in content/site.json, and list it in CONTENT.md.
- Known facts: name NSG Royal Resort; address Nidigattu, Bheemunipatnam, Bheemili; tagline "Make Every Moment Royal"; strapline "Weddings · Celebrations · Getaways"; confirmed amenities: swimming pool, cricket turf, gardens, penthouse. Two packages: "Whole Resort" and "Penthouse + Pool, Turf & Garden" (ground rooms excluded). Only one package can be booked at a time (one calendar). Online payment is an ADVANCE only, paid by UPI. Car rental: partner vehicles, self-drive, no driver.

## 2. Structure
src/*.html are templates -> tools/build.js -> dist/ (the deployed folder).
src/: index stay events cars gallery book status contact policies 404 styleguide (.html), partials/ (header, footer, offers-bar, sticky-bar), css/, js/, assets/{img,fonts,icons}
css: tokens.css base.css components.css pages.css print.css
js: classic scripts with defer, one namespace window.NSG, no inline handlers, each page loads only what it needs: api.js site.js calendar.js book.js payment.js gallery.js cars.js, vendor/
content/site.json (ALL editable copy, grouped by page; plus "ui" strings and "seo" per page), content/config.json (API_URL, SITE_URL, PHONE, WHATSAPP, TURNSTILE_SITE_KEY, FEATURES {cars:false, offers:true}, PAYMENT_MODE:"upi", USE_MOCK:true)
tools/: slots.json (image registry), images.js, build.js
originals/ (gitignored source photos), docs/api.md (backend README), CONTENT.md (placeholder log)

## 3. tools/build.js (Node, no dependencies, optional --watch)
- Copies src to dist. In .html: {{key}} = dot path into content/site.json; {{slot:name}} = image markup or placeholder (section 5); {{include:name}} = src/partials/name.html; <!--feature:NAME-->...<!--/feature--> is removed when FEATURES[NAME] is false, and that feature's page is not emitted.
- Unknown key: output "[MISSING: key]" and print a warning.
- Emits dist/js/config.js (window.NSG.CONFIG from config.json), dist/js/content.ui.js (the "ui" section), sitemap.xml, robots.txt, and LodgingBusiness JSON-LD on the home page (omit unknown fields).
- Serve dist with any static server (file:// is not supported).

## 4. Design tokens (tokens.css; never hardcode these values elsewhere)
Colors: --ivory #FBF8F2 (page), --sand #F1EADB (alternate sections), --emerald-900 #0E2F28, --emerald-700 #1B4D41, --gold #C29B4A, --gold-light #E8D5A3, --ink #1E2421, --muted #5E655F, --ok #2E7D5B, --warn #B7791F, --err #B3382C.
Rules: gold is never used for small text on ivory. Primary button = gold fill, ink text; hover = emerald-700 fill, ivory text. Secondary = transparent, 1px gold border. Dark sections use ivory text. Body text contrast >= 4.5:1.
Type: headings Cormorant Garamond 600; body Inter 400/500/600. Self-host WOFF2 latin subsets in assets/fonts with font-display swap; preload only the two used above the fold. If font files are absent, fall back to Georgia / system-ui and flag it in the report. Fluid scale: h1 clamp(2.4rem,6vw,4.2rem); h2 clamp(1.9rem,4vw,2.8rem); h3 1.4rem; body 1.0625rem/1.65.
Radius tokens: --r-btn 999px (buttons, chips, badges), --r-card 16px (cards, image frames), --r-input 12px. Radius changes happen only here.
Spacing: 4px scale; section padding clamp(3.5rem,8vw,7rem); container max 1180px; one soft shadow token. Thin gold hairlines as ornament.
Motion: 200ms ease; fade/translate-up on scroll via IntersectionObserver; ALL motion disabled under prefers-reduced-motion. No carousels, no autoplay video.
Accessibility: visible 2px gold focus outline with offset on every interactive element; touch targets >= 44px; use dvh with a vh fallback for full-height sections.

## 5. Image slots
Registry tools/slots.json: { "hero": {"ratio":"16/9","alt":"...","focal":"50% 40%","sizes":"100vw","priority":true}, ... }. Initial slots: hero; banner-stay, banner-events, banner-cars, banner-gallery, banner-contact (21/9); pkg-whole, pkg-penthouse (4/3); amenity-pool, amenity-turf, amenity-gardens, amenity-penthouse, amenity-cars, amenity-extra (4/3); event-wedding, event-birthday, event-corporate (3/2); gallery-01..gallery-30 (3/2, each with "cat": property|pool-turf|rooms|events|weddings); car-01..car-12 (4/3); og-image (1200x630 JPG, social preview).
tools/images.js: for each slot, if originals/<slot>.(jpg|jpeg|png|webp) exists, write src/assets/img/<slot>-480.webp, -960.webp, -1600.webp (quality 78, never upscale, strip metadata); og-image is written as og-image.jpg. Write src/assets/img/manifest.js (window.NSG.IMG = {slot:[widths]}). Idempotent. Print a filled/missing table. Logo is hand-placed at src/assets/img/logo.svg; if missing, use a text wordmark.
build.js {{slot:name}}: if the files exist, output <img srcset sizes width height alt loading=lazy decoding=async> with object-position from "focal" (priority slot: fetchpriority=high, no lazy, and a preload link in the head via {{preload:name}}). If not, output <div class="slot-ph" data-slot="name" data-label="name · ratio"> with the same aspect-ratio and radius.
Placeholder style: soft sand-to-emerald gradient, 1px gold-light border, small centered logo mark. Adding ?slots=1 to any URL shows data-label on every frame (tiny code in site.js, no network).
Dynamic images (cars, gallery lightbox): NSG.img(slot) builds markup from manifest.js, placeholder when absent. Every image has reserved dimensions (CLS < 0.1).

## 6. Components (define once in components.css; show all on styleguide.html)
Header (transparent over hero, solid after scroll, hamburger menu on mobile, "Book Now" pill), footer, offers bar, sticky mobile bar (Book / WhatsApp / Call; hidden on book.html), buttons (primary/secondary/ghost, sizes), chips/filters, section heading with gold line, cards (package, amenity tile, event, car, review), status badges, slot frame/placeholder, accordion, form controls with error states, toast, modal/lightbox, calendar (styles only here).
Offers bar: baked default text from site.json offers.default, then JS replaces it with live offers (GET offers; drop any whose start/end excludes today in Asia/Kolkata; max 5). Slow marquee that pauses on hover, focus and touch; static text under reduced-motion; a single offer does not scroll; dismiss button remembered in sessionStorage; bar height reserved to avoid layout shift.

## 7. API (the web app is Google Apps Script)
GET = query string. POST = JSON string body with header Content-Type: text/plain (no other headers). Responses are JSON with ok:boolean, plus code and error on failure.
- info -> resortName, address, checkInTime, checkOutTime, minNights, cancellationPolicy, packages[{id,name,weekdayRate,weekendRate,advance,maxGuests}], eventTypes[{id,name,advance}]
- availability (from,to) -> blocked nights as YYYY-MM-DD (check-in inclusive, check-out exclusive)
- quote (package,checkIn,checkOut,guests) -> nights, breakdown[{date,rate,kind}], total, advance, balance, available, minNights, maxGuests
- createBooking (POST) {bookingType:"stay"|"event", package, eventType, name, phone, email, guests, checkIn, checkOut, notes, _hp:"", turnstileToken} -> bookingId, status, amount, total, balance, holdExpiresAt, payment{mode,upiId,payeeName,upiLink,note}
- submitPayment (POST) {bookingId, utr}
- getBooking (bookingId, phoneLast4) -> booking{bookingId,status,bookingType,packageId,checkIn,checkOut,nights,guests,name,amount,total,balance,confirmedAt}
- eventEnquiry (POST) {name,phone,email,eventType,eventDate,guests,notes,turnstileToken}
- offers -> offers[{id,text,link,start,end}] (NOT BUILT YET)
- cars -> cars[{id,name,type,seats,transmission,fuel,ac,rateDay,rateKm,status,notes,order}], status: available|booked|on_request (NOT BUILT YET)
Error codes: INVALID_PHONE, DATES_UNAVAILABLE, RATE_LIMITED, TOO_MANY_HOLDS, DUPLICATE_UTR, NOT_FOUND, DATES_TAKEN_CONTACT_US, plus a generic fallback. Each maps to a friendly message in site.json ui.errors.
api.js is the ONLY file that knows raw response shapes: it normalises them into the shapes above. docs/api.md wins where it disagrees with this section; adapt api.js only. When CONFIG.USE_MOCK is true, api.js returns contract-exact mock data (placeholder rates, a few blocked dates, local quote logic, fake bookings).

## 8. Pages (section order)
HOME: header; hero (hero slot, H1 "Make Every Moment Royal", strapline, buttons Check Availability and Plan an Event, compact date bar that carries dates to book.html); trust strip (pool, turf, gardens, capacity, rating only if provided); "Two ways to stay" package cards (live from info: name, from-price, advance, inclusions, Select); amenities tiles (6, linking to stay.html; cars tile inside feature:cars); events band on emerald (3 cards); gallery preview (6); reviews (omit the whole section if none in site.json); "How booking works" 4 steps (choose dates, pay a small advance by UPI, we confirm, arrive); location (address, directions button, click-to-load map with no iframe until clicked); final call to action; footer. Sticky bar on mobile.
STAY: package comparison; amenity sections (2-3 photos, timings, capacity, rules); included vs extra; check-in/out and house rules; car rental section (feature:cars).
EVENTS: event types with inclusions; spaces and capacity; package outlines; past-events strip; two paths: "Hold your date" (book.html?type=event&event=<id>) and "Enquire first" (form -> eventEnquiry).
CARS (feature:cars): intro and terms strip (self-drive, partner vehicles, deposit/fuel/km/ID placeholders); filter chips by type; cards from the cars endpoint with status badge, Enquire on WhatsApp (prefilled with the car name), Call; note "Availability confirmed on enquiry".
GALLERY: filter chips by cat, grid, lightbox with keyboard and swipe, lazy loading.
BOOK, STATUS: see section 9. CONTACT: WhatsApp, call, address, click-to-load map, enquiry form. POLICIES: cancellation, terms, privacy, house rules (placeholders). 404.

## 9. Booking flow (phase 3)
Steps: (1) Stay/Event toggle, package (or event type), calendar, price summary showing total, advance due now and balance on arrival; (2) guest details, phone validated as an Indian 10-digit mobile, policy checkbox; (3) payment; (4) "Request received" with the booking ID and a link to status.html.
Calendar: handles YYYY-MM-DD strings only (never new Date("YYYY-MM-DD") for display); blocked dates cannot be a check-in; a range is invalid if it contains a blocked night; the check-out day MAY be a blocked date; enforce minNights; show 2 months, keyboard navigable with grid roles. Quote is fetched on change (debounced) with a skeleton.
Payment module (payment.js, switched by CONFIG.PAYMENT_MODE): "upi" shows the amount, QR of payment.upiLink (a small vendored MIT QR library, lazy-loaded only on this step), the UPI ID with a copy button, a "Pay with UPI app" button (mobile only) and a UTR field; "gateway" is a stub for later. Show a hold countdown from holdExpiresAt; on expiry offer to start again. Turnstile loads only on book.html and the event forms, and only if a site key is set. Include the honeypot field _hp.
Status page: lookup by booking ID + last 4 digits of the phone; badge (awaiting confirmation / confirmed / rejected / expired / cancelled); a "Print / Save as PDF" button using print.css (resort name, address, booking details, advance paid, balance due, check-in time). Call it "Booking confirmation", never "invoice" or "tax invoice".

## 10. Performance, SEO, accessibility
Budgets: hero <= 120 KB on mobile; JS on Home < 60 KB; LCP < 2.5 s on 4G; CLS < 0.1; Lighthouse mobile >= 90. Third-party scripts only where needed.
Semantic HTML, one H1 per page, lang="en", skip link, meta description and Open Graph per page from site.json seo, canonical from SITE_URL, alt text from the registry, no layout shift from the offers bar or fonts.

## 11. Agent working rules
- Write each file once, complete. Do not re-read files you just wrote. Do not print file contents in chat. No exploratory refactors.
- No extra features, dependencies, abstractions or restyling beyond the task. Later tasks: patch existing files with minimal edits and list the files touched.
- Never stop to ask. Missing input: use a placeholder and log it in CONTENT.md.
- Do not open browsers, run Lighthouse or take screenshots unless asked.
- Final report: at most 20 lines (files created or changed, placeholders added, assumptions, anything I must do manually).