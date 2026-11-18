/* NSG ROYAL RESORT — packages.js: package cards and the Stay comparison table from api.getInfo() (any number of
   packages, sorted by order). Mounts: [data-packages="cards" | "compare"]. book.js reuses NSG.Packages.card(p,
   { compact: true }) for its picker. Optional fields (subtitle, includes, excludes, bedrooms, ...) are skipped when
   absent. Icons: partials/pkg-icons.html. Text: site.json "packageUi" (#package-text). */
window.NSG = window.NSG || {};
(function () {
  'use strict';
  let t = {};
  try { t = JSON.parse(document.getElementById('package-text').textContent); } catch (e) {}
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  // Icon ids in the sprite; anything else falls back to a tick
  const ICONS = ['bedrooms', 'bath', 'guests', 'lounge', 'penthouse-lounge', 'terrace', 'kitchen', 'bar', 'home-theatre', 'pool', 'turf', 'garden', 'wifi', 'parking', 'check', 'cross'];
  const icon = (id) => `<svg class="pk-ic" aria-hidden="true"><use href="#pk-i-${ICONS.includes(id) ? id : 'check'}"/></svg>`;
  const label = (f) => (t.features && t.features[f.id]) || f.label;
  const count = (n, one, many) => fill(n === 1 ? one : many, { n: n });
  const wa = () => {
    const n = String((window.NSG.CONFIG || {}).WHATSAPP || '');
    return n && !n.startsWith('[TBD') ? `<a href="https://wa.me/${esc(n)}" target="_blank" rel="noopener noreferrer">${esc(t.askWhatsApp)}</a>` : `<a href="contact.html">${esc(t.askWhatsApp)}</a>`;
  };
  const failHtml = () => `<p class="pk-fail">${esc(t.loadError)} ${wa()}</p>`;

  function facts(p) {
    const out = [];
    if (p.bedrooms) out.push(['bedrooms', count(p.bedrooms, t.bedroomOne, t.bedrooms)]);
    if (p.bathrooms) out.push(['bath', count(p.bathrooms, t.bathroomOne, t.bathrooms)]);
    if (p.maxGuests) out.push(['guests', fill(t.guests, { n: p.maxGuests })]);
    return out.length ? `<ul class="pk-facts">${out.map((f) => `<li>${icon(f[0])}<span>${esc(f[1])}</span></li>`).join('')}</ul>` : '';
  }

  // "From" is the lower of the two rates; weekend shown only when it differs
  function price(p) {
    const rates = [p.weekdayRate, p.weekendRate].filter((r) => r > 0);
    if (!rates.length) return `<p class="pk-price pk-price--ask">${esc(t.onRequest)} ${wa()}</p>`;
    const from = Math.min.apply(null, rates);
    const more = [];
    if (p.weekendRate && p.weekendRate !== from) more.push(fill(t.weekend, { price: inr(p.weekendRate) }));
    if (p.advance) more.push(fill(t.advance, { price: inr(p.advance) }));
    return `<div class="pk-price"><p class="pk-from"><span>${esc(t.from)}</span> <strong>${inr(from)}</strong> <span>${esc(t.perNight)}</span></p>${more.length ? `<p class="pk-rates">${more.map(esc).join(' · ')}</p>` : ''}</div>`;
  }

  function card(p, opts) {
    const compact = !!(opts && opts.compact);
    const id = esc(p.id);
    const inc = p.includes.length ? `<ul class="pk-inc" aria-label="${esc(t.included)}">${p.includes.map((f) => `<li>${icon(f.id)}<span>${esc(label(f))}</span></li>`).join('')}</ul>` : '';
    const exc = p.excludes.length ? `<p class="pk-exc"><span class="pk-exc-icons" aria-hidden="true">${p.excludes.map((f) => `<span class="pk-x">${icon(f.id)}</span>`).join('')}</span><span>${esc(t.notIncluded)} ${esc(p.excludes.map((f) => label(f).toLowerCase()).join(', '))}</span></p>` : '';
    const media = `<div class="pk-media">${window.NSG.img ? window.NSG.img('pkg-' + p.id, p.name) : ''}${p.popular ? `<span class="pk-chip">${esc(t.popular)}</span>` : ''}</div>`;
    const sub = p.subtitle ? `<p class="pk-sub">${esc(p.subtitle)}</p>` : '';
    const details = `${facts(p)}${inc}${exc}${price(p)}`;
    // Compact (book.html): a radio named packageSelect; the label stretches over the whole card
    if (compact) {
      return `<div class="pk-card pk-card--compact${p.popular ? ' is-popular' : ''}"><input type="radio" name="packageSelect" value="${id}" id="pk-pick-${id}" class="pk-radio" aria-describedby="pk-d-${id}">${media}<div class="pk-body">${sub}<h3 class="pk-name"><label for="pk-pick-${id}">${esc(p.name)}</label></h3><div id="pk-d-${id}">${details}</div></div></div>`;
    }
    return `<article class="pk-card${p.popular ? ' is-popular' : ''}">${media}<div class="pk-body">${sub}<h3 class="pk-name">${esc(p.name)}</h3>${details}<a class="btn btn-primary btn-md pk-cta" href="book.html?package=${encodeURIComponent(p.id)}" aria-label="${esc(t.choose + ': ' + p.name)}">${esc(t.choose)}</a></div></article>`;
  }

  // Phones: the cards are a swipe row; dots follow the scroll (starts on the first card)
  function dots(row) {
    const n = row.children.length;
    if (n < 2) return;
    row.insertAdjacentHTML('afterend', `<div class="sc-dots" aria-hidden="true">${'<span></span>'.repeat(n)}</div>`);
    const marks = row.nextElementSibling.children;
    let raf = 0;
    const mark = () => {
      raf = 0;
      const c = row.scrollLeft + row.clientWidth / 2;
      let best = 0;
      for (let i = 1; i < n; i++) {
        const el = row.children[i];
        const b = row.children[best];
        if (Math.abs(el.offsetLeft + el.offsetWidth / 2 - c) < Math.abs(b.offsetLeft + b.offsetWidth / 2 - c)) best = i;
      }
      for (let i = 0; i < n; i++) marks[i].classList.toggle('is-active', i === best);
    };
    row.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(mark); }, { passive: true });
    mark();
  }

  // Stay: packages as columns, features as rows; rows without data in any package are left out
  function compare(list) {
    const c = t.compare || {};
    const cell = (on) => (on === null ? `<td class="pk-na">${esc(c.unknown)}</td>` : `<td class="${on ? 'pk-yes' : 'pk-no'}">${icon(on ? 'check' : 'cross')}<span class="visually-hidden">${esc(on ? c.yes : c.no)}</span></td>`);
    const row = (ic, name, cells) => `<tr><th scope="row">${ic ? icon(ic) : ''}<span>${esc(name)}</span></th>${cells}</tr>`;
    const nums = (key) => list.map((p) => `<td>${p[key] ? esc(p[key]) : esc(c.unknown)}</td>`).join('');
    const rows = [];
    if (list.some((p) => p.bedrooms)) rows.push(row('bedrooms', c.bedrooms, nums('bedrooms')));
    if (list.some((p) => p.bathrooms)) rows.push(row('bath', c.bathrooms, nums('bathrooms')));
    if (list.some((p) => p.maxGuests)) rows.push(row('guests', c.guests, nums('maxGuests')));
    if (list.some((p) => p.extraGuestFee)) rows.push(row('guests', c.extraGuests, list.map((p) => `<td>${p.extraGuestFee ? esc(fill(c.extraFee, { n: p.maxExtraGuests, fee: inr(p.extraGuestFee) })) : esc(c.unknown)}</td>`).join('')));
    const seen = [];
    // "bedrooms" is already the number row above
    list.forEach((p) => p.includes.concat(p.excludes).forEach((f) => { if (f.id !== 'bedrooms' && !seen.some((s) => s.id === f.id)) seen.push(f); }));
    seen.sort((a, b) => (ICONS.indexOf(a.id) + 1 || 99) - (ICONS.indexOf(b.id) + 1 || 99)).forEach((f) => {
      rows.push(row(f.id, label(f), list.map((p) => cell(p.includes.some((x) => x.id === f.id) ? true : p.excludes.some((x) => x.id === f.id) ? false : null)).join('')));
    });
    const rate = (key) => list.map((p) => `<td class="pk-num">${p[key] ? inr(p[key]) : esc(c.unknown)}</td>`).join('');
    if (list.some((p) => p.weekdayRate)) rows.push(row('', c.weekday, rate('weekdayRate')));
    if (list.some((p) => p.weekendRate)) rows.push(row('', c.weekend, rate('weekendRate')));
    if (list.some((p) => p.advance)) rows.push(row('', c.advance, rate('advance')));
    const head = list.map((p) => `<th scope="col">${esc(p.name)}${p.popular ? `<span class="pk-chip pk-chip--sm">${esc(t.popular)}</span>` : ''}</th>`).join('');
    return `<h3 class="pk-compare-title">${esc(c.title)}</h3><div class="pk-compare-scroll" role="region" tabindex="0" aria-label="${esc(c.caption)}"><table class="pk-compare"><caption class="visually-hidden">${esc(c.caption)}</caption><thead><tr><th scope="col">${esc(c.feature)}</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  window.NSG.Packages = { card: card, text: t, failHtml: failHtml };

  const mounts = document.querySelectorAll('[data-packages]');
  const api = window.NSG.api;
  if (!mounts.length || !api) return;
  function render(packages) {
    const list = (packages || []).filter((p) => p.id && p.name);
    mounts.forEach((el) => {
      const isCompare = el.getAttribute('data-packages') === 'compare';
      if (!list.length) { el.innerHTML = isCompare ? '' : failHtml(); return; }
      if (isCompare) { el.innerHTML = compare(list); return; }
      const dotsEl = el.nextElementSibling && el.nextElementSibling.classList.contains('sc-dots') ? el.nextElementSibling : null;
      if (dotsEl) dotsEl.remove();
      el.innerHTML = list.map((p) => card(p)).join('');
      el.classList.toggle('pk-row--few', list.length < 3);
      dots(el);
    });
  }
  // Cached info renders at once; the fresh copy re-renders only if something changed
  api.getInfo().then((r) => render(r && r.ok ? r.data.packages : null));
  if (api.infoChanged) api.infoChanged().then((d) => { if (d) render(d.packages); });
})();
