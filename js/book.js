window.NSG = window.NSG || {};
(function () {
'use strict';
function getQueryParam(k) {
try {
return new URLSearchParams(window.location.search).get(k) || '';
} catch (e) {
return '';
}
}
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const addonsList = () => (window.NSG.Addons ? window.NSG.Addons.list() : []);
function cleanPhone(raw) {
let p = String(raw || '').trim().replace(/[\s\-]/g, '');
if (p.startsWith('+91')) p = p.slice(3);
if (p.startsWith('91') && p.length === 12) p = p.slice(2);
if (p.startsWith('0') && p.length === 11) p = p.slice(1);
return p;
}
class BookingFlow {
constructor() {
this.currentStep = 1;
this.bookingType = 'stay';
this.selectedPackage = 'whole';
this.selectedEventType = 'wedding';
this.checkIn = null;
this.checkOut = null;
this.guests = 2;
this.infoData = null;
this.calendar = null;
this.quoteDebounce = null;
this.turnstileToken = '';
this.activeBooking = null;
this.init();
}
async init() {
if (window.NSG.Addons) window.NSG.Addons.onChange(() => this.fetchQuote());
const stored = this.getStoredBooking();
if (stored && new Date(stored.holdExpiresAt).getTime() > Date.now()) {
this.activeBooking = stored;
this.currentStep = 3;
}
await this.loadInfoAndInit();
this.parseUrlParams();
this.renderStepView();
if (this.currentStep === 3 && this.activeBooking) {
this.initStep3Payment();
}
this.initTurnstileIfConfigured();
}
getStoredBooking() {
try {
const raw = sessionStorage.getItem('nsg_active_booking');
return raw ? JSON.parse(raw) : null;
} catch (e) {
return null;
}
}
setStoredBooking(b) {
try {
sessionStorage.setItem('nsg_active_booking', JSON.stringify(b));
} catch (e) {}
}
clearStoredBooking() {
try {
sessionStorage.removeItem('nsg_active_booking');
} catch (e) {}
}
async loadInfoAndInit() {
try {
const res = await window.NSG.api.getInfo();
if (res.ok) this.infoData = res.data;
} catch (e) {}
let blockedDates = [];
try {
const availRes = await window.NSG.api.getAvailability();
if (availRes.ok) blockedDates = availRes.data;
} catch (e) {}
const calContainer = document.getElementById('calendar-container');
if (calContainer && window.NSG.Calendar) {
this.calendar = new window.NSG.Calendar(calContainer, {
mode: this.bookingType === 'stay' ? 'range' : 'single',
blockedDates: blockedDates,
checkIn: this.checkIn,
checkOut: this.checkOut,
onSelect: (dates) => this.handleDatesSelected(dates),
onError: (msg) => this.showCalendarError(msg)
});
}
this.setupEventListeners();
}
parseUrlParams() {
const type = getQueryParam('type');
if (type === 'event' || type === 'stay') this.bookingType = type;
const pkg = getQueryParam('package');
if (pkg === 'whole' || pkg === 'penthouse') this.selectedPackage = pkg;
const ev = getQueryParam('event');
if (ev) this.selectedEventType = ev;
const cIn = getQueryParam('checkIn');
const cOut = getQueryParam('checkOut');
const g = parseInt(getQueryParam('guests'), 10);
if (g > 0) this.guests = g;
if (cIn && /^\d{4}-\d{2}-\d{2}$/.test(cIn)) this.checkIn = cIn;
if (cOut && /^\d{4}-\d{2}-\d{2}$/.test(cOut)) this.checkOut = cOut;
document.querySelectorAll('input[name="bookingType"]').forEach((r) => {
if (r.value === this.bookingType) r.checked = true;
});
document.querySelectorAll('input[name="packageSelect"]').forEach((r) => {
if (r.value === this.selectedPackage) r.checked = true;
});
const evSelect = document.getElementById('event-type-select');
if (evSelect && this.selectedEventType) evSelect.value = this.selectedEventType;
const guestsInput = document.getElementById('guests-input');
if (guestsInput) guestsInput.value = this.guests;
if (this.calendar) {
this.calendar.setMode(this.bookingType === 'stay' ? 'range' : 'single');
if (this.checkIn) this.calendar.setDates(this.checkIn, this.checkOut);
}
this.updateFormFieldsForType();
if (this.checkIn && this.checkOut) this.fetchQuote();
}
setupEventListeners() {
document.querySelectorAll('input[name="bookingType"]').forEach((r) => {
r.addEventListener('change', (e) => {
this.bookingType = e.target.value;
this.calendar.setMode(this.bookingType === 'stay' ? 'range' : 'single');
this.updateFormFieldsForType();
this.fetchQuote();
});
});
document.querySelectorAll('input[name="packageSelect"]').forEach((r) => {
r.addEventListener('change', (e) => {
this.selectedPackage = e.target.value;
this.capGuestsInput();
this.fetchQuote();
});
});
const evSelect = document.getElementById('event-type-select');
if (evSelect) {
evSelect.addEventListener('change', (e) => {
this.selectedEventType = e.target.value;
this.fetchQuote();
});
}
const guestsInput = document.getElementById('guests-input');
if (guestsInput) {
guestsInput.addEventListener('input', (e) => {
this.guests = parseInt(e.target.value, 10) || 1;
this.fetchQuote();
});
}
const btnStep1 = document.getElementById('btn-step1-continue');
if (btnStep1) btnStep1.addEventListener('click', () => this.handleStep1Continue());
const btnStep2Back = document.getElementById('btn-step2-back');
if (btnStep2Back) {
btnStep2Back.addEventListener('click', () => {
this.currentStep = 1;
this.renderStepView();
});
}
const step2Form = document.getElementById('step2-form');
if (step2Form) step2Form.addEventListener('submit', (e) => this.handleStep2Submit(e));
}
updateFormFieldsForType() {
const stayBlock = document.getElementById('stay-options-block');
const eventBlock = document.getElementById('event-options-block');
if (stayBlock) stayBlock.style.display = this.bookingType === 'stay' ? 'block' : 'none';
if (eventBlock) eventBlock.style.display = this.bookingType === 'stay' ? 'none' : 'block';
this.capGuestsInput();
}
capGuestsInput() {
const guestsInput = document.getElementById('guests-input');
const guestsHint = document.getElementById('guests-max-hint');
if (!guestsInput || !this.infoData) return;
if (this.bookingType === 'stay') {
const pkg = this.infoData.packages.find((p) => p.id === this.selectedPackage) || this.infoData.packages[0];
guestsInput.max = pkg.maxGuests;
if (parseInt(guestsInput.value, 10) > pkg.maxGuests) {
guestsInput.value = pkg.maxGuests;
this.guests = pkg.maxGuests;
}
if (guestsHint) guestsHint.textContent = `Max ${pkg.maxGuests} guests for ${pkg.name}`;
} else {
guestsInput.max = 200;
if (guestsHint) guestsHint.textContent = 'Up to 200+ event attendees';
}
}
handleDatesSelected(dates) {
this.checkIn = dates.checkIn;
this.checkOut = dates.checkOut;
this.fetchQuote();
}
showCalendarError(msg) {
const el = document.getElementById('calendar-error-msg');
if (el) {
el.textContent = msg;
el.style.display = msg ? 'block' : 'none';
}
}
fetchQuote() {
if (window.NSG.Addons) window.NSG.Addons.setReady(!!(this.checkIn && this.checkOut));
if (!this.checkIn || !this.checkOut) {
this.renderQuoteSummary(null);
return;
}
const summaryEl = document.getElementById('price-summary-card');
if (summaryEl) summaryEl.classList.add('is-loading');
if (this.quoteDebounce) clearTimeout(this.quoteDebounce);
this.quoteDebounce = setTimeout(async () => {
try {
if (this.bookingType === 'stay') {
const res = await window.NSG.api.getQuote(this.selectedPackage, this.checkIn, this.checkOut, this.guests, addonsList());
if (res.ok) this.renderQuoteSummary(res.data);
else if (res.code === 'INVALID_ADDON') this.handleInvalidAddon(res, 'step1-error-alert');
} else {
const ev = (this.infoData && this.infoData.eventTypes.find((e) => e.id === this.selectedEventType)) || { advance: 10000 };
this.renderQuoteSummary({ nights: 1, total: ev.advance, advance: ev.advance, balance: 0, isEvent: true });
}
} catch (e) {
} finally {
if (summaryEl) summaryEl.classList.remove('is-loading');
}
}, 300);
}
renderQuoteSummary(quote) {
const card = document.getElementById('price-summary-card');
const liveRegion = document.getElementById('price-summary-live');
if (!card) return;
if (!quote) {
card.innerHTML = '<div class="summary-placeholder"><span>Select check-in and check-out dates to compute rate</span></div>';
if (liveRegion) liveRegion.textContent = 'Dates not selected.';
return;
}
const advanceDue = quote.advance || 0;
const totalAmount = quote.total || 0;
const balanceAmount = quote.balance || 0;
const nights = quote.nights || 1;
const addonRows = window.NSG.Addons
? window.NSG.Addons.summaryRows(quote, { isEvent: !!quote.isEvent, picked: quote.isEvent ? window.NSG.Addons.picked() : [] })
: [];
const addonUi = (window.NSG.UI && window.NSG.UI.addons) || {};
const addonHtml = addonRows.map((r) => `<div class="quote-row quote-row--addon${r.strong ? ' quote-row--addon-total' : ''}"><span>${escHtml(r.label)}${r.note ? ` <small>(${escHtml(r.note)})</small>` : ''}</span>${r.amount === null || r.amount === undefined ? '' : `<span>₹${Number(r.amount).toLocaleString('en-IN')}</span>`}</div>`).join('');
card.innerHTML = `
<div class="quote-header">
<span class="quote-nights">${nights} ${nights === 1 ? 'Night' : 'Nights'}</span>
<span class="quote-dates">${this.checkIn} &rarr; ${this.checkOut}</span>
</div>
<div class="quote-rows">
${addonHtml}
<div class="quote-row"><span>Total Estimated Cost</span><strong>₹${totalAmount.toLocaleString('en-IN')}</strong></div>
<div class="quote-row quote-row--advance"><span>Advance Due Now (UPI)</span><strong style="color:var(--emerald-900);">₹${advanceDue.toLocaleString('en-IN')}</strong></div>
<div class="quote-row"><span>Balance on Arrival</span><span>₹${balanceAmount.toLocaleString('en-IN')}</span></div>
</div>
<small class="text-muted" style="display:block;margin-top:8px;">*Advance required to secure hold. Balance collected at check-in.</small>
${addonRows.length ? `<small class="addons-paid-note">${escHtml(addonUi.paidAtResort)}</small>` : ''}
`;
if (liveRegion) {
liveRegion.textContent = `Total: ₹${totalAmount}, Advance due now: ₹${advanceDue}, Balance: ₹${balanceAmount}`;
}
}
handleStep1Continue() {
const errEl = document.getElementById('step1-error-alert');
if (!this.checkIn || !this.checkOut) {
if (errEl) {
errEl.textContent = 'Please choose your dates on the calendar to proceed.';
errEl.style.display = 'block';
}
return;
}
if (errEl) errEl.style.display = 'none';
this.currentStep = 2;
this.renderStepView();
const step2Summ = document.getElementById('step2-booking-overview');
if (step2Summ) {
step2Summ.innerHTML = `<strong>${this.bookingType === 'stay' ? (this.selectedPackage === 'whole' ? 'Whole Resort' : 'Penthouse Suite') : 'Event Booking'}</strong><span> · ${this.checkIn} to ${this.checkOut} · ${this.guests} Guests</span>`;
}
}
async handleStep2Submit(e) {
e.preventDefault();
const form = document.getElementById('step2-form');
const errBox = document.getElementById('step2-error-alert');
const submitBtn = document.getElementById('btn-step2-submit');
form.querySelectorAll('.form-group').forEach((g) => g.classList.remove('has-error'));
if (errBox) errBox.style.display = 'none';
const nameInput = document.getElementById('guest-name');
const phoneInput = document.getElementById('guest-phone');
const emailInput = document.getElementById('guest-email');
const policyCheckbox = document.getElementById('policy-checkbox');
const hpInput = document.getElementById('hp-field');
const notesInput = document.getElementById('guest-notes');
let firstInvalid = null;
if (!nameInput.value.trim()) {
nameInput.closest('.form-group').classList.add('has-error');
if (!firstInvalid) firstInvalid = nameInput;
}
const rawPhone = cleanPhone(phoneInput.value);
if (!/^\d{10}$/.test(rawPhone)) {
phoneInput.closest('.form-group').classList.add('has-error');
if (!firstInvalid) firstInvalid = phoneInput;
}
if (emailInput.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) {
emailInput.closest('.form-group').classList.add('has-error');
if (!firstInvalid) firstInvalid = emailInput;
}
if (!policyCheckbox.checked) {
policyCheckbox.closest('.form-group').classList.add('has-error');
if (!firstInvalid) firstInvalid = policyCheckbox;
}
if (firstInvalid) {
firstInvalid.focus();
return;
}
submitBtn.disabled = true;
submitBtn.textContent = 'Securing hold...';
const payload = {
bookingType: this.bookingType,
package: this.selectedPackage,
eventType: this.selectedEventType,
name: nameInput.value.trim(),
phone: rawPhone,
email: emailInput.value.trim(),
guests: this.guests,
checkIn: this.checkIn,
checkOut: this.checkOut,
notes: notesInput.value.trim(),
_hp: hpInput ? hpInput.value : '',
turnstileToken: this.turnstileToken,
addons: addonsList()
};
try {
const res = await window.NSG.api.createBooking(payload);
if (!res.ok) {
if (errBox) {
errBox.textContent = res.error || 'Booking reservation could not be completed.';
errBox.style.display = 'block';
}
if (res.code === 'INVALID_ADDON' && window.NSG.Addons) window.NSG.Addons.reload();
submitBtn.disabled = false;
submitBtn.textContent = 'Proceed to Advance Payment →';
return;
}
this.activeBooking = res.data;
this.setStoredBooking(this.activeBooking);
if (window.NSG.Addons) window.NSG.Addons.clear(); // sent once with this hold
this.currentStep = 3;
this.renderStepView();
this.initStep3Payment();
} catch (err) {
if (errBox) {
errBox.textContent = 'Connection error. Please check your internet and try again.';
errBox.style.display = 'block';
}
submitBtn.disabled = false;
submitBtn.textContent = 'Proceed to Advance Payment →';
}
}
handleInvalidAddon(res, alertId) {
const el = document.getElementById(alertId);
if (el) {
el.textContent = res.error;
el.style.display = 'block';
}
if (window.NSG.Addons) window.NSG.Addons.reload();
}
initStep3Payment() {
const container = document.getElementById('step3-payment-container');
if (!container || !window.NSG.PaymentHandler) return;
new window.NSG.PaymentHandler(container, {
booking: this.activeBooking,
onSuccess: (data) => {
this.currentStep = 4;
this.clearStoredBooking();
this.renderStepView();
this.renderStep4Confirmation(data);
},
onRestart: () => {
this.clearStoredBooking();
this.activeBooking = null;
this.currentStep = 1;
this.renderStepView();
}
});
}
renderStep4Confirmation(data) {
const container = document.getElementById('step4-confirmation-content');
if (!container) return;
const bookingId = data.bookingId;
const statusUrl = `status.html?id=${encodeURIComponent(bookingId)}`;
container.innerHTML = `
<div class="confirmation-card">
<div class="confirmation-icon">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
</div>
<h2 class="confirmation-heading">Request Received & Hold Placed</h2>
<p class="confirmation-sub">Your transaction reference <code>${data.utr}</code> has been received. Our team will verify and send your confirmation receipt shortly.</p>
<div class="booking-id-box">
<span class="booking-id-label">Your Booking Reference ID</span>
<div class="booking-id-value"><strong id="final-booking-id">${bookingId}</strong><button type="button" class="btn btn-secondary btn-sm" id="btn-copy-bid">Copy ID</button></div>
</div>
<div class="confirmation-next-steps">
<h4>What happens next?</h4>
<ol>
<li>Our staff will verify your UPI transaction reference (UTR).</li>
<li>You will receive an official booking confirmation via WhatsApp or Email.</li>
<li>You can check your real-time booking status anytime using your Booking ID.</li>
</ol>
</div>
<div class="confirmation-actions">
<a href="${statusUrl}" class="btn btn-primary btn-md">Check Booking Status</a>
<button type="button" class="btn btn-secondary btn-md" onclick="window.print()">Print Confirmation</button>
</div>
</div>
`;
const copyBtn = container.querySelector('#btn-copy-bid');
if (copyBtn) {
copyBtn.addEventListener('click', () => {
if (navigator.clipboard) {
navigator.clipboard.writeText(bookingId).then(() => {
copyBtn.textContent = 'Copied!';
setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 2000);
});
}
});
}
}
renderStepView() {
for (let s = 1; s <= 4; s++) {
const el = document.getElementById(`book-step-${s}`);
const indicator = document.getElementById(`step-indicator-${s}`);
if (el) el.style.display = s === this.currentStep ? 'block' : 'none';
if (indicator) {
if (s < this.currentStep) indicator.className = 'step-pill step-pill--done';
else if (s === this.currentStep) indicator.className = 'step-pill step-pill--active';
else indicator.className = 'step-pill';
}
}
window.scrollTo({ top: 0, behavior: 'smooth' });
}
initTurnstileIfConfigured() {
const config = (window.NSG && window.NSG.CONFIG) || {};
const siteKey = config.TURNSTILE_SITE_KEY;
if (!siteKey || siteKey.startsWith('[TBD') || siteKey.trim() === '') return;
const container = document.getElementById('turnstile-container');
if (!container) return;
window.onTurnstileSuccess = (token) => { this.turnstileToken = token; };
const script = document.createElement('script');
script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
script.async = true;
script.defer = true;
script.onload = () => {
if (window.turnstile) {
window.turnstile.render('#turnstile-container', { sitekey: siteKey, callback: 'onTurnstileSuccess' });
}
};
document.head.appendChild(script);
}
}
document.addEventListener('DOMContentLoaded', () => {
new BookingFlow();
});
})();
