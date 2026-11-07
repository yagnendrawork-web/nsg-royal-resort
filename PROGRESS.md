# Task A Checkpoint
A1: 2s safety timeout + noscript reveal already in site.js/index.html; content visible without JS.
A2: All site.js inits wrapped in try/catch; no abort on individual failures.
A3: api.js fetchWithTimeout(8s) on all requests; non-JSON/network failures return {ok:false, code:"NETWORK"}; no throws. Home packages fallback uses site.json home.packages with fallbackPrice/fallbackAdvance placeholders + WhatsApp link from CONFIG.WHATSAPP.
A4: hero-section min-height 70vh/70dvh already in pages.css.

# Task B Checkpoint
B1: build.js <!--each:PATH--> blocks implemented (dot path or @slots:PREFIX); {{.field}} and {{slot:.field}} substitutions; feature flag for cars.html works.
B2: npm scripts "check" and "build:prod" added; --prod omits gallery frames without images, prints count (64 omitted).
B3: tools/check.js (~50 lines) validates dist: no broken links, no {{ or [MISSING:, data-slot in slots.json, exactly one <h1> per page.
B4: 7 new pages created: stay.html, events.html, gallery.html, contact.html, policies.html, 404.html, cars.html (feature-flagged). Each follows index.html pattern with seo, one H1, slots, partials.
B5: api.js cars() with 3 mock cars + offers() mock; both with 8s timeout/no-throw/NETWORK code.
B6: Navigation links already in header/footer partials; sitemap.xml includes all new pages (excludes status.html, cars.html when disabled).
B7: Page-specific JS all under 30 KB (api.js 30KB shared, site.js 21KB shared).
VERIFY 1-5 all pass.

# Stage A (site upgrade, 2026-11-02)
A: api.js addons() (15s, no throw), quote/createBooking send add-ons, getBooking returns them, 4 mock add-ons; cars() now derived from category "car" add-ons.
A: build + check pass; INVALID_ADDON friendly message added to ui.errors.

# Stage B (site upgrade)
B: Home rebuilt in brief order (hero + date bar + reassurance, exclusivity, live-price packages, experiences, dining teaser, events band + videos, booking steps line, location, final CTA); reviews omitted (none in site.json). build.js gained nested <!--sub:--> loops, in-memory video data, JS output trimming, stale-page cleanup, _redirects copy.
B: build + check pass; Home JS 58.2 KB (was 62.6 KB); hero image eager with fetchpriority high.

# Stage C (site upgrade)
C: dining.html added (banner-dining hero, brand pair intro, live food packages from addons, a la carte menu with sticky chips, dotted price leaders and veg/non-veg marks, food-01..12 photo slots); Dining in header, footer, sitemap, Stay amenity tile, Amenities link.
C: build + check pass (13 pages); menu seeded with one [TBD] item per section, logged in CONTENT.md.

# Stage D (site upgrade)
D: Aroma logo saved as src/assets/img/aroma-logo.png (360px, 34 KB, from the attached image; original in originals/). brand-pair partial (same height, gold hairline, stacks under 400px) in footer, Home dining teaser and Dining intro; not in header. build.js includes nest up to 3 levels.
D: build + check pass.

# Stage E (site upgrade)
E: Past-event YouTube videos: one parser (tools/youtube.js) used by build + check; cards on Home (3), Events (Past celebrations) and Gallery (filterable by cat); the existing gallery lightbox inserts a youtube-nocookie iframe only on open plus a Watch on YouTube link, and removes it on close. Lightbox moved to partials/lightbox.html.
E: build + check pass; parser verified on 8 URLs; scratch build with sample videos renders cards and skips the invalid URL. gallery.videos is empty until real URLs are added.

# Stage F (site upgrade)
F: book.html "Make it special" add-ons (addons.js: grouped Food/Travel/Car rental, Add/Remove with aria-pressed, qty stepper, Skip, ?addons= preselect, sessionStorage, INVALID_ADDON refresh); book.js hooks send add-ons to quote/createBooking and show server add-on rows; status/print list add-ons. Cars: nav link removed, cars.html no longer emitted (_redirects 301 to stay.html#car-rental), Car rental section on Stay via cars.js (live car add-ons, else 2 [TBD] known cars).
F: build + check pass (12 pages); node --check on changed JS ok; mock add-on summary verified (none, each unit, remove, duplicate).

# Stage G (site upgrade)
G: policies.html rebuilt from site.json policiesPage: 21 sections in the requested order, sticky table of contents (chips on mobile), anchors #cancellation #privacy #terms #house-rules kept; every binding value is [TBD] and listed in CONTENT.md ("Owner must review all policies before launch").
G: build + check pass. --launch did not exist; added tools/check.js --launch + npm run check:launch, confirmed it exits 1 while [TBD] remain.

# Final polish (2026-11-02)
Photos: 33 real photos named in originals/library/ (new uploads + existing, screenshots trimmed, collage split) and mapped to 63 slots with accurate alt text; all 30 gallery frames filled (portrait shots use 3/4 frames); car photos from Wikimedia Commons (CC BY-SA 4.0, credited on cards); previous originals kept in originals/_previous/. Package slider captions, Stay "What you get" (6 frames), On request items, check-in 11 AM / check-out 10 AM, Stay house rules removed, one-line policies, Home events band contrast, dining menu note.
Checks: build + check pass, no empty image frames on any page, add-on summary verify passes, Home JS 55.1 KB. build.js now also removes stale dist images.

# Dining menu + real policies (2026-11-02)
Aroma menu (173 dishes, 6 sections) transcribed from the PDF into src/assets/data/aroma-menu.json; menu.js renders tabs, veg/non-veg filter and search on dining.html; food photos and Aroma logo cut from the PDF. Policies rewritten as real-world terms (owner to approve); templates no longer use nested loops, so even the old dev server renders them.
