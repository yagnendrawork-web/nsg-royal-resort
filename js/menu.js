(function () {
'use strict';
const root = document.getElementById('aroma-menu-app');
if (!root) return;
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tabs = root.querySelector('.menu-tabs');
const panel = root.querySelector('.menu-panel');
const search = root.querySelector('.menu-search-input');
const diets = root.querySelectorAll('.menu-diet');
const live = root.querySelector('.menu-live');
let data = null;
let current = '';
let diet = 'all';
const keep = (item) => diet === 'all' || (diet === 'veg' ? item.veg : !item.veg);
function itemHtml(it) {
return `<li class="mi"><span class="mi-mark ${it.veg ? 'is-veg' : 'is-nonveg'}" role="img" aria-label="${it.veg ? 'Vegetarian' : 'Non-vegetarian'}"></span><span class="mi-name">${esc(it.name)}</span><span class="mi-dots" aria-hidden="true"></span><span class="mi-price">${esc(it.price)}</span></li>`;
}
function groupHtml(g, items, extra) {
return `<article class="menu-group">
<header class="menu-group-head"><h4 class="menu-group-title">${esc(g.title)}</h4>${extra || `<span class="menu-group-tag ${g.veg === true ? 'is-veg' : g.veg === false ? 'is-nonveg' : ''}">${esc(g.tag)}</span>`}</header>
<ul class="menu-items">${items.map(itemHtml).join('')}</ul>
</article>`;
}
function photo(slot, alt) {
return `<img src="assets/img/${slot}-960.webp" srcset="assets/img/${slot}-480.webp 480w, assets/img/${slot}-960.webp 960w" sizes="(min-width: 1100px) 1100px, 100vw" alt="${esc(alt)}" width="1200" height="400" loading="lazy" decoding="async">`;
}
function render() {
const q = search.value.trim().toLowerCase();
let html = '';
let count = 0;
if (q) {
data.categories.forEach((c) => c.groups.forEach((g) => {
const items = g.items.filter((it) => keep(it) && it.name.toLowerCase().includes(q));
if (!items.length) return;
count += items.length;
html += groupHtml({ title: g.title, veg: g.veg, tag: c.title }, items);
}));
panel.innerHTML = count
? `<p class="menu-result-note">${count} ${count === 1 ? 'dish' : 'dishes'} for “${esc(search.value.trim())}”</p><div class="menu-groups">${html}</div>`
: `<p class="menu-empty">No dishes match “${esc(search.value.trim())}”. Try another word.</p>`;
} else {
const c = data.categories.find((x) => x.id === current) || data.categories[0];
c.groups.forEach((g) => {
const items = g.items.filter(keep);
if (!items.length) return;
count += items.length;
html += groupHtml(g, items);
});
panel.innerHTML = `<figure class="menu-banner">${photo(c.photo, c.title)}<figcaption><span class="menu-banner-title">${esc(c.title)}</span></figcaption></figure>`
+ (count ? `<div class="menu-groups">${html}</div>` : `<p class="menu-empty">No ${diet === 'veg' ? 'vegetarian' : 'non-vegetarian'} dishes in ${esc(c.title)}.</p>`);
}
panel.classList.remove('is-switching');
void panel.offsetWidth;
panel.classList.add('is-switching');
if (live) live.textContent = `${count} dishes shown`;
}
function select(id, focus) {
current = id;
tabs.querySelectorAll('[role="tab"]').forEach((t) => {
const on = t.dataset.id === id;
t.setAttribute('aria-selected', String(on));
t.tabIndex = on ? 0 : -1;
if (on) {
tabs.scrollTo({ left: t.offsetLeft - (tabs.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
if (focus) t.focus({ preventScroll: true });
}
});
if (search.value) search.value = '';
render();
}
function build() {
tabs.innerHTML = data.categories.map((c, i) => `<button type="button" role="tab" class="menu-tab" data-id="${esc(c.id)}" aria-selected="${i === 0}" aria-controls="menu-panel" tabindex="${i === 0 ? 0 : -1}">${esc(c.title)}</button>`).join('');
const list = Array.from(tabs.querySelectorAll('[role="tab"]'));
list.forEach((t, i) => {
t.addEventListener('click', () => select(t.dataset.id));
t.addEventListener('keydown', (e) => {
const next = e.key === 'ArrowRight' ? list[(i + 1) % list.length] : e.key === 'ArrowLeft' ? list[(i - 1 + list.length) % list.length] : null;
if (next) { e.preventDefault(); select(next.dataset.id, true); }
});
});
diets.forEach((b) => b.addEventListener('click', () => {
diet = b.dataset.diet;
diets.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
render();
}));
let t = null;
search.addEventListener('input', () => {
clearTimeout(t);
t = setTimeout(() => {
tabs.classList.toggle('is-searching', !!search.value.trim());
render();
}, 120);
});
root.classList.add('is-ready');
select(data.categories[0].id);
}
fetch('assets/data/aroma-menu.json')
.then((r) => r.json())
.then((json) => { data = json; build(); })
.catch(() => {
panel.innerHTML = '<p class="menu-empty">The menu could not load. Please refresh, or ask us on WhatsApp.</p>';
});
})();
