(function () {
'use strict';
document.querySelectorAll('[data-optional]').forEach(function (el) {
if (el.textContent.indexOf('[TBD') !== -1) el.hidden = true;
});
const links = Array.prototype.slice.call(document.querySelectorAll('.am-jump-link'));
if (!links.length || !('IntersectionObserver' in window)) return;
const bar = document.querySelector('.am-jump-list');
const byId = {};
links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
function light(id) {
links.forEach(function (a) {
const on = a === byId[id];
a.classList.toggle('is-active', on);
if (on) {
a.setAttribute('aria-current', 'true');
bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
} else {
a.removeAttribute('aria-current');
}
});
}
const io = new IntersectionObserver(function (entries) {
entries.forEach(function (e) {
if (e.isIntersecting) light(e.target.id);
});
}, { rootMargin: '-35% 0px -60% 0px' });
Object.keys(byId).forEach(function (id) {
const el = document.getElementById(id);
if (el) io.observe(el);
});
})();
