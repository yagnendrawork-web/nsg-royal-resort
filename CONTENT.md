# Content Placeholder Log (CONTENT.md)

Per SPEC Section 1 & 11: Never invent facts. Any unknown value is marked as an obvious placeholder and listed here.

| Item | Location | Placeholder Value | Status |
|------|----------|-------------------|--------|
| API_URL | `content/config.json` | `[TBD: API_URL]` | Awaiting Apps Script endpoint |
| SITE_URL | `content/config.json` | `[TBD: SITE_URL]` | Awaiting deployment domain |
| PHONE | `content/config.json` | `[TBD: PHONE]` | Awaiting primary resort phone number |
| WHATSAPP | `content/config.json` | `[TBD: WHATSAPP]` | Awaiting resort WhatsApp contact |
| TURNSTILE_SITE_KEY | `content/config.json` | `[TBD: TURNSTILE_SITE_KEY]` | Awaiting Cloudflare Turnstile key |
| checkInTime | `content/site.json` (`site.checkInTime`) | `[TBD: checkInTime]` | Awaiting confirmed standard check-in hour |
| checkOutTime | `content/site.json` (`site.checkOutTime`) | `[TBD: checkOutTime]` | Awaiting confirmed standard check-out hour |
| phone / whatsapp / email | `content/site.json` (`footer.*`) | `[TBD: phone]`, etc. | Awaiting contact details |
| event capacity | `content/site.json` (`home.trust.items[3].detail`) | `[TBD: event capacity]` | Awaiting lawn/turf capacity numbers |
| extra amenity details | `content/site.json` (`home.amenities.items[5].desc`) | `[TBD: extra amenity details]` | Awaiting full amenities list |
| cancellation policy | `api.js` (mock) | `[TBD: cancellation policy]` | Awaiting formal cancellation policy |
| reviews | `content/site.json` (`home.reviews`) | `[]` (Empty array) | Section omitted until real verified reviews exist |
| whole resort weekday rate | `content/site.json` (`home.packages.whole.fallbackPrice`) | `[TBD: whole resort weekday rate]` | Awaiting confirmed pricing |
| whole resort advance | `content/site.json` (`home.packages.whole.fallbackAdvance`) | `[TBD: whole resort advance]` | Awaiting confirmed advance |
| penthouse weekday rate | `content/site.json` (`home.packages.penthouse.fallbackPrice`) | `[TBD: penthouse weekday rate]` | Awaiting confirmed pricing |
| penthouse advance | `content/site.json` (`home.packages.penthouse.fallbackAdvance`) | `[TBD: penthouse advance]` | Awaiting confirmed advance |
| stay page package pricing | `content/site.json` (`stay.*`) | `[TBD: ...]` | Awaiting confirmed pricing |
| policies cancellation text | `content/site.json` (`policies.cancellation`) | `[TBD: cancellation policy]` | Awaiting formal policy |
| policies terms text | `content/site.json` (`policies.terms`) | `[TBD: terms and conditions]` | Awaiting formal terms |
| policies privacy text | `content/site.json` (`policies.privacy`) | `[TBD: privacy policy]` | Awaiting formal policy |
| policies house rules text | `content/site.json` (`policies.houseRules`) | `[TBD: house rules]` | Awaiting formal rules |

### Added 30 Oct 2026 (T1: hardcoded copy moved to `content/site.json` → `copy.*`; invented facts replaced)

| Item | Location (`content/site.json`) | Placeholder Value | Status |
|------|-------------------------------|-------------------|--------|
| whole resort / penthouse max guests | `copy.book.allSuitesPenthousePool`, `copy.book.rooftopSuiteWithPool` | `[TBD: whole resort max guests]`, `[TBD: penthouse max guests]` | Was invented ("Max 100" / "Max 20") |
| package advances (Book page) | `copy.book.n10000AdvanceRequired`, `copy.book.n5000AdvanceRequired` | `[TBD: whole resort advance]`, `[TBD: penthouse advance]` | Was ₹10,000 / ₹5,000 (Home said ₹7,000) |
| event advances | `copy.book.weddingReception10000` … `otherCelebration2000`, `copy.events.advance10000`, `copy.events.advance5000`, `copy.events.*AdvanceAmount` | `[TBD: wedding/birthday/corporate/other event advance]` | Awaiting boss; must match Config `eventAdvance_*` |
| event inclusions & package details | `copy.events.grandLawnMandapSetup`, `dedicatedEventCoordination`, `eventCoordination`, `fullDayLawnAccess`, `poolsideDeckSetupCoordination`, `lawnDeckBreakoutSpaces2` | `[TBD: ...]` | Was invented (mandap, coordination) |
| space capacities | `copy.events.upTo200Guests`, `upTo80Guests`, `upTo30Players`, `upTo20Guests` | `[TBD: ... capacity]` | Was invented (200/80/30/20) |
| home event capacity, extra amenity | `copy.home.weddingsGatherings`, `copy.home.dedicatedEstateCaretakersAnd` | `[TBD: event capacity]`, `[TBD: extra amenity details]` | "Dedicated caretakers" contradicted "no staffed front desk" |
| directions & parking | `copy.home.convenientlyPositionedAlongThe` | `[TBD: directions and parking details]` | Parking claim unverified |
| stay add-ons | `copy.stay.customCateringDecor`, `eventCoordinationServices`, `earlyCheckInLate` | `[TBD: add-on 1..3]` | Was invented |
| house rules (Stay page) | `copy.stay.noSmokingInsideThe`, `petsAllowedWithPrior`, `musicMustEndBy`, `guestsAreResponsibleFor` | `[TBD: house rule 1..4]` | Was invented (pets, 10 PM music) |
| floodlights | removed from `copy.home.*`, `copy.stay.boxCricketTurfWith` | n/a | Not a confirmed amenity; re-add if true |
| minimum nights (Book page notice) | `content/site.json` (`book.minNightsNotice`) | `[TBD: minimum nights]` | Added in polish pass; old text said "2 nights" (unconfirmed). Must match Config `minNights` |

## Amenities page (added 2026-11-01)
| Key | Placeholder | Notes |
|---|---|---|
| copy.amenities.foodDetail | [TBD: Aroma menu, meal timings and how guests order] | Hidden on the page until filled |
| copy.amenities.barDetail | [TBD: drinks bar details and timings] | Hidden until filled |
| copy.amenities.fridgeDetail | [TBD: where the refrigerator is and its size] | Hidden until filled |
| copy.amenities.snacksDetail | [TBD: snacks offered and whether they are included or paid] | Hidden until filled |

## Home hero (site upgrade, 2026-11-02)
| Key | Value | Notes |
|---|---|---|
| home.hero.h1 | Your Own Royal Resort in Bheemili | In use |
| (alternative 1) | Your Group, Your Private Resort | Not used; swap into home.hero.h1 if preferred |
| (alternative 2) | The Whole Resort, Just for You | Not used; swap into home.hero.h1 if preferred |

## Dining page (site upgrade, 2026-11-02)
| Key | Placeholder | Notes |
|---|---|---|
| dining.introText | [TBD: in-house or partner] | Relationship between the resort and Aroma Restaurant. (Earlier you described Aroma as a partner; please confirm the wording.) |
| dining.menu.sections[*].items | [TBD: dish name] / [TBD: short description] / [TBD: price] | One seed item per section: Starters, Biryani, Main course, Breads, Desserts, Beverages. Set veg to true, false or null. |
| slots food-01..food-12 | [TBD: describe this dish] | Alt text for each food photo once photos are added to originals/ |
| Food packages | (none) | Come only from the Addons sheet (category food) with real prices |

## Car rental (site upgrade, 2026-11-02) — owner must verify before publishing
| Key | Placeholder | Notes |
|---|---|---|
| cars.known[0].name | [TBD: verify] Audi Q5 | Shown only if the Sheet has no car add-ons; prices only come from the Sheet |
| cars.known[1].name | [TBD: verify model] Mercedes | Exact model |
| cars.known[*].description | [TBD: seats, fuel, gearbox] | |
| ui.cars.terms | [TBD: deposit], [TBD: fuel policy], [TBD: km limit], [TBD: ID rules] | Partner terms; permits and insurance to be confirmed (HANDOFF section 3) |

## Owner must review all policies before launch (site upgrade, 2026-11-02)
Every binding value on policies.html is a placeholder. The owner must read the whole page, approve the wording, and fill each item below. `npm run check:launch` fails while any [TBD] remains.

| Section | Placeholder |
|---|---|
| check-in | [TBD: check-in time] |
| check-in | [TBD: check-out time] |
| check-in | [TBD: early check-in / late check-out charge] |
| payment | [TBD: accepted payment methods at the resort] |
| cancellation | [TBD: number of days] |
| cancellation | [TBD: what happens to the advance] |
| cancellation | [TBD: what happens to the advance] |
| cancellation | [TBD: rescheduling deadline and how many times] |
| cancellation | [TBD: any rescheduling fee] |
| refunds | [TBD: refund method, for example the same UPI account] |
| refunds | [TBD: number of working days] |
| guest-id | [TBD: which photo IDs are accepted, and whether every adult must show ID] |
| occupancy | [TBD: allowed or not, limits and any charge] |
| occupancy | [TBD: age rules and whether they count as guests] |
| conduct | [TBD: where smoking is allowed] |
| conduct | [TBD: alcohol rules] |
| damage | [TBD: how damage is charged, and whether a security deposit applies and how much] |
| pool-safety | [TBD: confirm] |
| pool-safety | [TBD: pool hours] |
| pool-safety | [TBD: swimwear rules] |
| amenities | [TBD: turf hours and floodlight rules] |
| amenities | [TBD: any other amenity rules] |
| food | [TBD: allowed or not, and any charge] |
| pets | [TBD: allowed or not, and any conditions] |
| noise | [TBD: time] |
| events | [TBD: event hours] |
| events | [TBD: rules and any charges] |
| events | [TBD: rules] |
| safety | [TBD: emergency contact number at the resort] |
| safety | [TBD: nearest hospital and distance] |
| privacy | [TBD: how long records are kept] |
| liability | [TBD: confirm wording and any exceptions] |
| house-rules | [TBD: quiet hours] |
| house-rules | [TBD: any other house rules] |
| (page) | [TBD: date the owner approves these policies] |

## Policies rewritten as one-line drafts (final polish, 2026-11-02)
At the owner's request every policy now has a plain one-line draft (no [TBD]). Check-in 11 AM and check-out 10 AM are confirmed. The other lines are sensible defaults written from how the booking system works; the owner should read and approve them before launch. The earlier [TBD] list above is superseded.

## Policies: real-world drafts (2026-11-02)
Policies were rewritten as full, realistic terms (cancellation tiers 7+ days / 3-6 days / under 72 h, refunds in 7 working days, pool 7 AM-8 PM, outdoor music until 10 PM, ID rules, security deposit for events, etc.). These are reasonable industry-standard defaults, not confirmed by the owner. The owner should read and approve every policy before launch.
