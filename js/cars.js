window.NSG = window.NSG || {};
(function () {
'use strict';
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ui(key) {
const all = (window.NSG && window.NSG.UI) || {};
return (all.cars && all.cars[key]) || (all.labels && all.labels[key]) || '';
}
function getWhatsAppLink(carName) {
const config = (window.NSG && window.NSG.CONFIG) || {};
const waNumber = config.WHATSAPP && !config.WHATSAPP.startsWith('[TBD') ? config.WHATSAPP : '';
if (!waNumber) return 'contact.html';
return 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent('Enquiry about car: ' + carName);
}
function renderCarCard(car) {
const waLink = getWhatsAppLink(car.name);
const external = waLink.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
const photo = car.slot && window.NSG.img ? window.NSG.img(car.slot, car.name, 'card-car-img') : null;
const priced = car.rateDay !== null && car.rateDay !== undefined;
return `
<article class="card-car reveal is-revealed">
<div class="card-car-media">
${photo || '<div class="slot-ph" style="aspect-ratio: 4/3;"><div class="slot-ph-content"><span class="slot-ph-label">' + esc(car.slot || 'car photo') + ' · 4/3</span></div></div>'}
</div>
<div class="card-car-body">
<h3 class="card-car-title">${esc(car.name)}</h3>
${car.description ? `<p class="car-desc">${esc(car.description)}</p>` : ''}
<div class="car-rate">
${priced
? `<span class="rate-currency">₹</span><span class="rate-val">${Number(car.rateDay).toLocaleString('en-IN')}</span><span class="rate-period">${esc(ui('perDay'))}</span>`
: `<span class="rate-val rate-val--request">${esc(ui('priceOnRequest'))}</span>`}
</div>
${car.details ? `<p class="car-details">${esc(car.details)}</p>` : ''}
<p class="car-terms">${esc(ui('terms'))}</p>
<p class="car-availability">${esc(ui('availabilityNote'))}</p>
<div class="car-actions">
<a href="${waLink}" class="btn btn-secondary btn-sm"${external}>${esc(ui('enquireWhatsApp'))}</a>
${priced ? `<a href="book.html?addons=${encodeURIComponent(car.id)}" class="btn btn-primary btn-sm">${esc(ui('addToBooking'))}</a>` : ''}
</div>
</div>
</article>
`;
}
function initCars() {
const container = document.getElementById('cars-container');
const api = (window.NSG && window.NSG.api) || {};
if (!container || typeof api.cars !== 'function') return;
api.cars().then(function (res) {
const cars = res && res.ok && Array.isArray(res.data) ? res.data : [];
if (cars.length) container.innerHTML = cars.map(renderCarCard).join('');
}).catch(function (err) {
console.warn('Cars API error:', err);
});
}
document.addEventListener('DOMContentLoaded', initCars);
})();
