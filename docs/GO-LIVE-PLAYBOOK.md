# NSG Royal Resort: Go-Live Playbook

Work through the phases **in order**. Each phase says who does it, how long it takes, and how to know it worked.

| Phase | What | Time |
|---|---|---|
| 1 | Freeze and back up everything | 20 min |
| 2 | Save the code in Git and GitHub | 30 min |
| 3 | Clean up and optimise the website code (Claude Code) | 1 to 2 h |
| 4 | Clean up the backend and Sheet test data | 45 min |
| 5 | Final pre-launch checklist | 1 to 2 h |
| 6 | Publish on Cloudflare Pages (preview URL) | 30 min |
| 7 | Connect the domain and go live | 30 min, plus waiting time |
| 8 | Day 1 after launch | 1 h |
| 9 | How to make changes after launch | Reference |
| 10 | Emergencies and rollback | Reference |

---

## Phase 1: Freeze and back up (do this first)

1. **Stop all Claude Code sessions.** Let any running task finish, then close it.
2. **Back up the folders.** In Finder, right-click each folder, choose **Compress**, and rename the zip with today's date:
   - `nsg-resort-site-2026-11-18.zip` (website)
   - `nsg-web-backend-2026-11-18.zip` (backend)
3. **Back up the photos.** Copy the `originals/` folder to Google Drive, in a folder called `NSG website photos`. These files are not saved in Git (too large).
4. **Back up the Google Sheet.** Open it and use **File → Make a copy**. Name it `NSG Bookings BACKUP 2026-11-18`. Don't touch the copy again.
5. **Back up the Apps Script code.** Apps Script keeps versions: **Deploy → Manage deployments** shows them. Also note the current version number on paper.

✅ Done when: you have 2 zips, the photos on Drive, and a Sheet copy.

---

## Phase 2: Save the code in Git and GitHub

Git saves every version of your code, so any mistake can be undone. GitHub keeps a private copy online, and Cloudflare will publish the site straight from it.

### 2.1 One-time setup (Mac)
Open **Terminal** and run each line:
```
git --version
```
If it asks to install developer tools, click **Install** and wait. Then:
```
brew install gh
gh auth login
```
Choose: **GitHub.com → HTTPS → Login with a web browser**, then follow the code it shows. Create a free GitHub account first if you don't have one. Use the resort's email if possible.

### 2.2 Website repository
```
cd ~/Desktop/nsg-resort-site
```
(Use your real folder path. Tip: type `cd ` then drag the folder into Terminal.)

Check that a `.gitignore` file exists with at least these lines (Claude Code creates it in Phase 3; if you're doing this first, create it now with TextEdit as plain text):
```
node_modules/
dist/
originals/
.DS_Store
```
Then:
```
git init
git add .
git commit -m "Launch candidate before cleanup"
gh repo create nsg-resort-site --private --source=. --push
```

### 2.3 Backend repository
```
cd ~/Desktop/"nsg web backend"
git init
git add .
git commit -m "Backend launch candidate"
gh repo create nsg-resort-backend --private --source=. --push
```
The backend repo only stores the code. Apps Script is still where it runs.

### 2.4 Safety check: no secrets in Git
```
git grep -n -i -E "bot[0-9]{6,}|AAF|BOT_TOKEN.*:|pepper.*=|secret.*="
```
It should print nothing, or only variable *names*. Your bot token, chat IDs and PIN pepper live in Apps Script **Script Properties**, never in files. If something real shows up, tell Claude before pushing again.

✅ Done when: both repos appear (private) on github.com.

### Everyday Git commands (keep this)
```
git status                      # what changed
git add .                       # stage all changes
git commit -m "What I changed"  # save a version
git push                        # send to GitHub (publishes the site after Phase 6)
git log --oneline -10           # last 10 versions
```

---

## Phase 3: Clean up and optimise the website (Claude Code)

Git saved everything in Phase 2, so the cleanup can safely delete files; anything can be brought back.

1. Open Claude Code in the **website folder**, type `/clear`.
2. Save the prompt below as `tasks/21-launch-cleanup.md`, then send: `Read tasks/21-launch-cleanup.md and execute it exactly.`
3. After it finishes, test locally (`npm run build`, `npm run dev`), then save the result:
   ```
   git add .
   git commit -m "Launch cleanup and optimisation"
   git push
   ```

### Prompt: tasks/21-launch-cleanup.md
```
TASK: LAUNCH CLEANUP, OPTIMISATION AND HANDOVER DOCS. Fresh session: read HANDOFF.md, CLAUDE.md, SPEC.md, PROGRESS.md, CONTENT.md and docs/api.md first. The code is committed in Git, so deletions are reversible, but follow the rules below exactly. Do not change visible design, copy, booking/payment logic or content/config.json values. Work in stages; after each, run node tools/build.js and npm run check, and add a checkpoint to PROGRESS.md.

STAGE 1: INVENTORY (no changes yet)
List, with file paths and sizes: (a) source files not referenced by any page, partial, script or the build (unused HTML, JS, CSS, images in src/assets/img, fonts, vendor files); (b) features that were removed or disabled (old cars.html, old two-package code paths, offers bar code if no page uses it, demo slots, any styleguide-only code, the old test page); (c) dead CSS selectors (selectors not matching anything in src HTML or created by JS: search JS for class names before calling a selector dead); (d) console.log/debug code; (e) duplicated helpers. Write the list to CLEANUP.md.

STAGE 2: SAFE REMOVAL
- Delete only items from the inventory that are clearly unreferenced. Keep: everything behind a feature flag that may be turned on later (cars), the mock layer in api.js (needed for local testing), styleguide.html (dev only), tools/, tasks/, docs/.
- Remove debug console.log calls (keep console.warn/error in error paths).
- In --prod builds: strip the mock data block from the shipped api.js (wrap it in markers like /* MOCK:START */ ... /* MOCK:END */ that build.js removes when --prod is set), exclude styleguide.html, test pages and source maps, and exclude any image that no page references.
- Record every deletion in CLEANUP.md.

STAGE 3: PERFORMANCE
- Images: list any image in dist over 200 KB and any <img> missing width/height or loading/decoding attributes; fix the attributes. The hero and LCP image must be eager with fetchpriority=high and preloaded; everything else lazy.
- Fonts: only the weights actually used are preloaded/declared; font-display swap.
- JS/CSS: each page loads only the scripts it needs (check every page's script tags); defer everywhere; no render-blocking JS except the tiny theme script in <head>. Without adding dependencies, add a simple safe minify step to --prod for CSS (strip comments and extra whitespace) and leave JS unminified if a safe minifier would need a dependency. Report total bytes per page (HTML + CSS + JS + images above the fold) before and after.
- Cloudflare files in dist: _headers (HTML: Cache-Control: no-cache; /assets/* and /css/* and /js/*: public, max-age=604800; X-Content-Type-Options: nosniff; Referrer-Policy: strict-origin-when-cross-origin; X-Frame-Options: SAMEORIGIN; Permissions-Policy: camera=(), microphone=(), geolocation=()), and _redirects with the old Hostinger URLs: /amenities /stay.html 301, /gallery /gallery.html 301, /contact /contact.html 301, /blogs / 301, /blog / 301, /cars.html /stay.html#car-rental 301, /home / 301. Keep any rules already there.

STAGE 4: LAUNCH SAFETY
- Confirm `node tools/build.js --prod --launch` fails with a clear list when: any [TBD: or [MISSING: remains, USE_MOCK is true, API_URL is empty/placeholder, PHONE/WHATSAPP/SITE_URL are empty, any review name starts with "Sample", payPageUrl contains TBD (if the pay page exists). Print the current failures (I will fix content, not you).
- Add .gitignore (node_modules/, dist/, originals/, .DS_Store, *.log) if missing or incomplete.
- Add an npm script "launch": "node tools/build.js --prod --launch && node tools/check.js".
- noindex is present on pay, staff, status and 404 pages; sitemap.xml lists only public pages and uses SITE_URL.

STAGE 5: DOCS
- Rewrite HANDOFF.md section "Status" to reflect the launched state (what is built, flags, where data lives) without deleting the guards and business rules.
- Create README.md for the repo: what the project is, folder map, commands (npm install, images, build, dev, check, launch), how to add photos (slot names), how to edit text (site.json), how prices/packages/add-ons/reviews are edited (Google Sheet tabs), how to deploy (git push -> Cloudflare Pages builds `npm run launch`, output `dist`), how to roll back (Cloudflare Pages deployments), and where secrets live (Apps Script Script Properties; never in the repo).

VERIFY: node tools/build.js; node tools/build.js --prod (must succeed); npm run check; node --check on changed JS; report the --launch failures list. REPORT in 20 lines or fewer: deletions (count + biggest items), bytes saved, per-page weights, --launch failures I must fix, and anything you chose not to remove and why.
```

✅ Done when: build passes, the site looks the same locally, and the cleanup is committed and pushed.

---

## Phase 4: Clean up the backend and the Sheet test data

All the test bookings, fake staff bookings, test blocks and test enquiries are real rows in the Sheet. Active test rows (HOLD, PAYMENT_SUBMITTED, CONFIRMED) **block real dates** on the calendar and show in the staff app, so they must go before launch.

### 4.1 Run the backend cleanup prompt
1. Open Claude Code in the **backend folder**, type `/clear`.
2. Save the prompt below as `tasks/22-backend-launch-cleanup.md`, then send: `Read tasks/22-backend-launch-cleanup.md and execute it exactly.`
3. Paste the new `Code.gs` into Apps Script and save. Do NOT run anything yet.

### Prompt: tasks/22-backend-launch-cleanup.md
```
TASK: BACKEND LAUNCH CLEANUP (Apps Script). Fresh session: read HANDOFF.md and CLAUDE.md first. Patch Code.gs in place; keep guards G1-G5 exactly; no behaviour changes for guests or staff except what is listed.

1. ARCHIVE TOOL: add archiveTestData(dryRun) runnable from the editor and from the NSG menu ("NSG > Archive test data (preview)" runs dryRun true; "NSG > Archive test data (run)" asks a confirmation dialog, then runs dryRun false).
   - Candidates: rows in Bookings, Events and ManualBlocks whose name, notes, staffNote or reason contains (case-insensitive) test, demo, mock, sample, dummy, fake, overlap, or whose phone is one used by the test functions (read the phones from the test functions in the code, e.g. 9876543210, 9123456780, 9123456781, 9876540000), or whose createdBy is "Demo Staff", or bookingId equals BK-DEMO-0001.
   - Dry run: write the candidate list (tab, row, id, name, phone last 4, dates, status, reason matched) to a new tab "Cleanup_Preview" and show the count in a dialog. Change nothing else.
   - Run: copy every candidate row to a new tab "Archive_<yyyy-MM-dd>" (with a column "fromTab"), then delete those rows from the source tabs (delete from the bottom up), clear the Log tab except the header, clear the CacheService keys used by the code (packages, addons, reviews, rate limits), and post one Telegram notice "Test data archived: <n> rows". Use LockService.
2. STAFF SESSIONS: add revokeAllStaffSessions() (menu item) that increments every staff row's sessionVersion and deletes stored session properties, so test logins on any phone stop working; staff log in again with their PIN.
3. TEST FUNCTIONS: make every test* function write only rows marked as test (name prefixed "TEST ") and delete its own rows at the end (in a finally block), so running tests later never leaves data behind. Add runAllTests() that runs them all and logs a pass/fail table.
4. LAUNCH CHECK: add launchCheck() (menu item "NSG > Launch check") that shows a dialog listing problems: Config keys still containing TBD or placeholder values (upiId, payeeName, resortAddress, checkInTime, checkOutTime, cancellationPolicy, payPageUrl, googleReview links); Packages with active TRUE but missing maxGuests/rates/advance; Reviews named "Sample"; missing Script Properties (BOT_TOKEN, ALLOWED_CHAT_IDS, WEBHOOK_SECRET, WEB_APP_URL, STAFF_PEPPER; TURNSTILE_SECRET only as a warning); fewer than 1 active staff row; any active booking (HOLD, PAYMENT_SUBMITTED, CONFIRMED) whose check-out date is in the past; the time-driven trigger missing. Never print secret values, only whether they are set.
5. Update docs/api.md and README (new menu items, cleanup steps, how to roll back a deployment: Manage deployments > edit > choose a previous version).
REPORT in 10 lines or fewer, plus the exact order I should run things in.
```

### 4.2 Clean the data (in this order)
1. **Reload the Google Sheet.** The **NSG** menu appears in the top bar.
2. **NSG → Archive test data (preview).** Open the new `Cleanup_Preview` tab and read every row.
   - If a **real** booking or real walk-in block is listed by mistake, note it down; you'll re-add it in step 5.
3. **NSG → Archive test data (run).** Confirm. Test rows move to an `Archive_<date>` tab, and the Log is cleared.
4. **NSG → Revoke all staff sessions.** Then set the real PINs for the 4 staff (in Apps Script, run `setStaffPin` for each person, a different 6-digit PIN each, not 123456). Give each person their PIN privately.
5. Re-add any real booking that was archived by mistake (staff app, or `/block` for walk-ins).
6. **Reviews tab:** delete the 10 "Sample Guest" rows. Add real reviews only.
7. **Packages tab:** all 3 rows filled (max guests for Grand Suite and Crown Penthouse), `active TRUE`, then **NSG → Refresh packages**.
8. **Config tab:** real values for upiId, payeeName, resortAddress, check-in/out times, cancellation policy, payPageUrl (`https://www.nsgroyalresort.in/pay.html`), googleReviewUrl, googleWriteReviewUrl.
9. **NSG → Launch check.** Fix everything it lists until it's clean.
10. **Deploy:** Manage deployments → pencil → **New version** → Deploy. Then run `setWebhook` once.
11. **Run `runAllTests`** to confirm everything works. Tests now clean up after themselves.
12. Save the backend code: in Terminal, in the backend folder: `git add . && git commit -m "Launch cleanup" && git push`.

### Optional: start completely fresh
If **nothing** in the Sheet is real yet, you can instead delete every row below the header in **Bookings, Events, ManualBlocks and Log**. Keep **Config, Packages, Addons, Reviews, Staff**. Then do steps 4 to 12.

✅ Done when: the staff app shows no fake bookings, the website calendar shows no test blocks, and the Launch check is clean.

---

## Phase 5: Final pre-launch checklist

### 5.1 Owner decisions (confirmed, not guessed)
- [ ] Packages: Royal Estate (25 guests, ₹25k weekday / ₹28k weekend, ₹10k advance), Grand Suite (__ guests, ₹18k / ₹20k, ₹5k), Crown Penthouse (__ guests, ₹13k / ₹15k, ₹2k). Max guests filled.
- [ ] Extra guests ₹500 per head per night, max 5 extra.
- [ ] Event tiers ₹45k / ₹55k / ₹65k: per event? Boundaries (25–50, 51–75, 75+) correct?
- [ ] Included services: BBQ 2h, campfire 2h, DJ available, LED screen, tables and chairs. **Box cricket: free or paid? Hours?** Included for all packages and events?
- [ ] Policies: cancellation, refund, deposit (₹2–3k?), check-in/out times, ID, pets, outside food, noise, visitors.
- [ ] UPI ID and bank account confirmed. Payee name matches the bank.
- [ ] Phone/WhatsApp: **7013566993** everywhere.
- [ ] Cars: permits and insurance confirmed? If not, FEATURES.cars stays false.
- [ ] Aroma Restaurant: in-house or partner wording; food packages advance notice hours.
- [ ] Offers bar: keep or remove.

### 5.2 Website content
- [ ] `npm run launch` passes (no [TBD], no mock, no sample reviews, config filled).
- [ ] config.json: USE_MOCK false, API_URL = live /exec, SITE_URL `https://www.nsgroyalresort.in`, PHONE `+917013566993`, WHATSAPP `917013566993`, PAYMENT_MODE `upi`, TURNSTILE_SITE_KEY (if used).
- [ ] Home title "Your Royal Retreat in Bheemili".
- [ ] Every visible photo frame has a real photo: hero, showcase (private, pool, rooms), packages (3), explore collage incl. the new wide tile, amenities, food, events, services (optional). Gallery hides empty frames in prod.
- [ ] Logo, Aroma badge, favicon, og-image.
- [ ] Demo video: replaced by YouTube or kept on purpose; permission for guest faces.
- [ ] Policies page fully written and approved by the boss.
- [ ] A human has read every page for spelling, prices and old package names.

### 5.3 Function (test every page in **light and dark** mode)
- [ ] Home, Stay & Amenities, Events, Dining, Gallery, Contact, Policies, Book, Status, Pay, Staff, 404.
- [ ] Every button does something. No dead chips on the Amenities page.
- [ ] Booking: each package, an event, extra guests, food add-ons (min 8), refresh mid-booking, hold expiry, status lookup, print confirmation.
- [ ] Staff app: login, New booking link with special price and custom advance, Send on WhatsApp, Extend hold, Confirm with amount received, Collect balance, Cancel, Block/unblock dates.
- [ ] Pay link page: every state (hold, submitted, confirmed, expired).
- [ ] Enquiry forms and add-on WhatsApp buttons open a chat with 7013566993.
- [ ] Reviews: only real ones shown, none when empty.

### 5.4 Payments (real money, small amounts)
- [ ] GPay, PhonePe, Paytm: correct amount and payee name.
- [ ] The ₹10,000 advance works (not just ₹1).
- [ ] QR scans in **dark mode** too.
- [ ] Duplicate UTR is rejected.
- [ ] Refund the test payments to yourself.

### 5.5 Telegram and staff
- [ ] All 4 people get alerts with sound (group not muted).
- [ ] Everyone has tried Confirm, Reject, /block, /list, /pending.
- [ ] Staff app on everyone's home screen with their own PIN.
- [ ] The golden rule: check the bank before Confirm; enter the amount actually received.
- [ ] Phone and walk-in bookings are always entered (staff app or /block).
- [ ] Who watches alerts at night is agreed.

### 5.6 Devices and speed
- [ ] iPhone Safari, Android Chrome, Instagram in-app browser (send yourself the link in an Instagram DM).
- [ ] 360 px wide Android: no sideways scrolling.
- [ ] Lighthouse mobile ≥ 90, LCP < 2.5 s, CLS < 0.1.
- [ ] Chrome DevTools → Network → Slow 4G: still usable.

---

## Phase 6: Publish on Cloudflare Pages (preview first)

1. Create a free account at **dash.cloudflare.com** (use the resort's email).
2. **Workers & Pages → Create → Pages → Connect to Git.** Authorise GitHub and select **nsg-resort-site**.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run launch`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `20`
4. **Save and Deploy.** Wait for "Success". If the build fails, open the log: it usually lists `[TBD]` items from the launch check. Fix them, commit, push, and it rebuilds by itself.
5. You get a free address like `nsg-resort-site.pages.dev`. **Test the whole checklist (5.3 to 5.6) on this address**, including one real booking.
6. Show the boss this address for final approval.

Every `git push` to `main` now rebuilds and republishes the site automatically, within about a minute.

---

## Phase 7: Connect the domain and go live

Do this in the morning or at a quiet time, never late at night.

### 7.1 Before you start
- [ ] Find out **where the domain is registered** (probably Hostinger: hPanel → Domains). You need its login.
- [ ] Find out if the resort uses **email on this domain** (like info@nsgroyalresort.in). If yes, those records must be copied exactly.
- [ ] Take screenshots of the current DNS records in hPanel → Domains → DNS / Nameservers. This is your rollback reference.
- [ ] Don't cancel the Hostinger plan or the domain. Check the domain's renewal date.

### 7.2 Move DNS to Cloudflare (recommended)
1. Cloudflare dashboard → **Add a domain** → `nsgroyalresort.in` → **Free** plan.
2. Cloudflare scans the existing records. **Compare them with your screenshots.** Make sure every **MX**, **TXT** (SPF, DKIM, verification) and email-related record is there. Add any missing ones.
3. Cloudflare shows **two nameservers**. In Hostinger hPanel → Domains → `nsgroyalresort.in` → **Nameservers** → **Change nameservers** → paste the two Cloudflare nameservers → Save.
4. Wait for Cloudflare to say the domain is **Active** (often 15 minutes, up to 24 hours). The old site keeps working while you wait.
5. Cloudflare → Workers & Pages → your project → **Custom domains** → add `www.nsgroyalresort.in`, then add `nsgroyalresort.in`. Cloudflare creates the records for you.
6. Make one address the main one: Cloudflare → your domain → **Rules → Redirect Rules** → redirect `nsgroyalresort.in/*` to `https://www.nsgroyalresort.in/$1` (301). (Or the other way round; SITE_URL uses www, so keep www.)
7. SSL/TLS → **Full**, and turn on **Always Use HTTPS**.

### 7.3 Check it's live
- [ ] `https://www.nsgroyalresort.in` shows the new site (try on mobile data, not just Wi-Fi).
- [ ] `nsgroyalresort.in` and `http://` versions redirect to `https://www.`.
- [ ] Old links work: `/amenities`, `/gallery`, `/contact`, `/blogs`.
- [ ] Email still works: send a test email to and from the domain address (if used).
- [ ] One real booking on the live domain end to end.

---

## Phase 8: Day 1 after launch

- [ ] **Google Search Console:** add the domain (verification is easy via Cloudflare DNS), then submit `https://www.nsgroyalresort.in/sitemap.xml`.
- [ ] **Google Business Profile:** website link, phone 7013566993, photos; send the review request to past guests.
- [ ] **Instagram:** bio link, reel captions, story highlight "Book".
- [ ] **WhatsApp Business:** greeting and away messages with the booking link; quick replies; catalogue/profile link.
- [ ] **Alternate Hostinger demo site** (coral-badger…): take it down or unpublish it, so Google doesn't show two sites with different prices.
- [ ] Banner and print materials show the correct address.
- [ ] Tell the staff the site is live and remind them of the golden rule.

### First week
- [ ] Daily: Apps Script → **Executions** (look for red errors); one quick test booking; Telegram alerts arriving.
- [ ] Ask staff what confused them.
- [ ] Note real guest questions for an FAQ.
- [ ] After a smooth week, decide about cancelling the Hostinger site plan (keep the domain registration!).

---

## Phase 9: How to make changes after launch

### A. Prices, packages, add-ons, reviews, offers: Google Sheet only (instant, no code)
1. Edit the tab (Packages, Addons, Reviews, Config).
2. **NSG → Refresh packages** (or wait 5 to 10 minutes).
3. Check `YOUR_EXEC_URL?action=info` and the website.

### B. Text or photos on the website
1. Text: edit `content/site.json`. Photos: put `<slot-name>.jpg` in `originals/`, then `npm run images`.
2. `npm run build` → `npm run dev` → check in the browser (both themes, phone width).
3. `npm run launch` must pass.
4. Save and publish:
   ```
   git add .
   git commit -m "Update gallery photos"
   git push
   ```
5. Cloudflare publishes in about a minute. Hard refresh the live site to check.

### C. Bigger changes with Claude Code (new sections, redesigns)
1. Make a **branch** so the live site isn't touched:
   ```
   git checkout -b new-feature-name
   ```
2. In Claude Code: `/clear`, then save your prompt as `tasks/NN-name.md` and say `Read tasks/NN-name.md and execute it exactly.`
3. Test locally. Then push the branch:
   ```
   git add . && git commit -m "Describe the change" && git push -u origin new-feature-name
   ```
   Cloudflare builds a **preview link** for the branch (Workers & Pages → your project → Deployments). Test it on your phone, show the boss.
4. When happy, publish:
   ```
   git checkout main
   git merge new-feature-name
   git push
   ```
5. If it's bad, just switch back with `git checkout main`. The live site was never affected.

### D. Backend changes (Code.gs)
1. Make the change in Claude Code in the backend folder (a task file, as above).
2. `git add . && git commit -m "..." && git push` in the backend folder.
3. Paste `Code.gs` into Apps Script and save. Run `migrateSheets` if the task says so.
4. **Manage deployments → pencil → New version → Deploy.** (Never "New deployment"; that changes the URL.)
5. If the task says so, run `setWebhook` again.
6. Run `runAllTests` and check `YOUR_EXEC_URL?action=info`.
7. Copy the backend's `docs/api.md` into the website's `docs/` folder if it changed.

### E. Staff changes
- New staff member: run `setStaffPin("Name", "PIN")` in Apps Script, add them to the Telegram group, and give them the staff app link.
- Someone leaves: set their `active` to FALSE in the Staff tab, remove them from the Telegram group, and change the group's sharing settings if needed.
- Forgotten PIN: run `setStaffPin` again with a new PIN. This logs them out everywhere.

---

## Phase 10: Emergencies and rollback

| Problem | What to do |
|---|---|
| The new website is broken after a push | Cloudflare → Workers & Pages → project → **Deployments** → choose the last good one → **Rollback**. Then fix calmly and push again. |
| The whole new site has a serious problem on launch day | Switch the nameservers in Hostinger back to the old ones (your screenshots). The old site returns within hours. |
| Prices or packages look wrong | Check the Packages/Config tabs, then NSG → Refresh packages. |
| Booking or payment errors after a backend change | Apps Script → Manage deployments → pencil → Version: choose the **previous** version → Deploy. |
| Telegram alerts stopped | Run `setWebhook` in Apps Script; check BOT_TOKEN and ALLOWED_CHAT_IDS; check the bot is still in the group. |
| A date got double booked | Contact the newer guest immediately, offer other dates or a refund. Check that the phone booking was blocked. Remind staff to always block walk-ins. |
| A guest says they paid but nothing shows | Ask for the UTR. In the staff app or Sheet, search the booking. Check the bank. If paid, confirm it with the amount received. |
| Staff phone lost | NSG → Revoke all staff sessions, then set a new PIN for that person. |
| The Sheet got edited by mistake | File → Version history in Google Sheets → restore the earlier version. |

Keep this playbook in the repo (`docs/GO-LIVE-PLAYBOOK.md`) so it's always with the code.
