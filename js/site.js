/**
 * NSG ROYAL RESORT — SITE LOGIC
 * site.js: Classic deferred script under window.NSG namespace (SPEC Section 5 & 6)
 */

window.NSG = window.NSG || {};

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. ?slots=1 Parameter Support
  // -------------------------------------------------------------------------
  function initSlotLabels() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('slots') === '1') {
        document.body.classList.add('show-slots');
      }
    } catch (e) {
      // Fallback
    }
  }

  // -------------------------------------------------------------------------
  // 2. Dynamic Image Generator (from manifest.js)
  // -------------------------------------------------------------------------
  window.NSG.img = function (slotName, alt, className) {
    const manifest = (window.NSG && window.NSG.IMG) || {};
    const widths = manifest[slotName];
    const safeAlt = alt || slotName;
    const safeClass = className ? ` ${className}` : '';

    if (widths && widths.length > 0) {
      if (slotName === 'og-image') {
        return `<img class="slot-img${safeClass}" src="assets/img/og-image.jpg" width="1200" height="630" alt="${safeAlt}">`;
      }
      const srcset = widths.map((w) => `assets/img/${slotName}-${w}.webp ${w}w`).join(', ');
      const src = `assets/img/${slotName}-${widths[0]}.webp`;
      return `<img class="slot-img${safeClass}" src="${src}" srcset="${srcset}" alt="${safeAlt}" loading="lazy" decoding="async">`;
    }

    return `<div class="slot-ph${safeClass}" data-slot="${slotName}" data-label="${slotName}">
      <div class="slot-ph-content">
        <span class="slot-ph-label">${slotName}</span>
      </div>
    </div>`;
  };

  // -------------------------------------------------------------------------
  // 3. Header Scroll State
  // -------------------------------------------------------------------------
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    // No dark hero: keep the solid header
    const solid = !document.querySelector('.hero-section');

    function onScroll() {
      header.classList.toggle('site-header--scrolled', solid || window.scrollY > 30);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // -------------------------------------------------------------------------
  // 4. Nav: current page, sliding indicator, mobile overlay
  // -------------------------------------------------------------------------
  function initMobileMenu() {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.header-nav');
    if (!toggle || !nav) return;

    const links = nav.querySelectorAll('.nav-link');
    const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
    let current = null;
    links.forEach(function (a) {
      if (a.getAttribute('href').replace(/\.html$/, '') === page) {
        a.setAttribute('aria-current', 'page');
        current = a;
      }
    });

    // Indicator: width set once, then translateX + scaleX
    const capsule = nav.querySelector('.nav-capsule');
    const ind = capsule && capsule.querySelector('.nav-indicator');
    let base = 0;
    const place = function (link, instant) {
      if (!ind) return;
      links.forEach(function (a) { a.classList.toggle('is-lit', a === link); });
      if (!link) { ind.style.opacity = '0'; return; }
      const c = capsule.getBoundingClientRect();
      const r = link.getBoundingClientRect();
      if (!r.width) return;
      if (!base) { base = r.width; ind.style.width = base + 'px'; }
      if (instant) ind.classList.add('no-anim');
      ind.style.transform = 'translateX(' + (r.left - c.left) + 'px) scaleX(' + r.width / base + ')';
      ind.style.opacity = '1';
      if (instant) { void ind.offsetWidth; ind.classList.remove('no-anim'); }
    };
    if (ind) {
      links.forEach(function (a) {
        a.addEventListener('mouseenter', function () { place(a); });
        a.addEventListener('focus', function () { place(a); });
      });
      capsule.addEventListener('mouseleave', function () { place(current); });
      capsule.addEventListener('focusout', function (e) {
        if (!capsule.contains(e.relatedTarget)) place(current);
      });
      let queued = false;
      const reset = function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; base = 0; place(current, true); });
      };
      reset();
      window.addEventListener('resize', reset);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(reset);
    }

    // Mobile overlay
    const root = document.documentElement;
    const setOpen = function (open, refocus) {
      nav.classList.toggle('is-open', open);
      root.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { const first = nav.querySelector('a'); if (first) first.focus(); }
      else if (refocus) toggle.focus();
    };

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'), true);
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false, false);
    });

    document.addEventListener('keydown', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (e.key === 'Escape') { setOpen(false, true); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: toggle + overlay links
      const items = [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll('a, button')));
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    });

    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (mq) {
      if (mq.matches && nav.classList.contains('is-open')) setOpen(false, false);
    });
  }

  // -------------------------------------------------------------------------
  // 5. Package photo sliders (scroll-snap; JS adds arrows, dots, pop)
  // -------------------------------------------------------------------------
  function initPackageSliders() {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('.pkg-slider').forEach(function (slider) {
      const track = slider.querySelector('.pkg-slides');
      const slides = track ? track.querySelectorAll('.pkg-slide') : [];
      if (slides.length < 2) return;

      const dots = document.createElement('div');
      dots.className = 'pkg-dots';
      dots.setAttribute('aria-hidden', 'true');
      slides.forEach(function () { dots.appendChild(document.createElement('span')); });

      const makeBtn = function (cls, label, symbol, dir) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pkg-slider-btn pkg-slider-' + cls;
        btn.setAttribute('aria-label', label + ' photo');
        btn.innerHTML = symbol;
        btn.addEventListener('click', function () { go(current + dir); });
        return btn;
      };

      let current = -1;
      const go = function (i) {
        i = (i + slides.length) % slides.length;
        track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      };

      const setActive = function (i) {
        if (i === current) return;
        current = i;
        slides.forEach(function (s, n) { s.classList.toggle('is-active', n === i); });
        Array.prototype.forEach.call(dots.children, function (d, n) { d.classList.toggle('is-active', n === i); });
        slider.classList.remove('is-popping');
        void slider.offsetWidth;
        slider.classList.add('is-popping');
      };

      let ticking = false;
      track.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          setActive(Math.round(track.scrollLeft / track.clientWidth));
        });
      }, { passive: true });

      slider.appendChild(makeBtn('prev', 'Previous', '&#8249;', -1));
      slider.appendChild(makeBtn('next', 'Next', '&#8250;', 1));
      slider.appendChild(dots);
      slider.classList.add('is-ready');
      setActive(0);
    });
  }

  // -------------------------------------------------------------------------
  // 6. Scroll Reveal via IntersectionObserver
  // -------------------------------------------------------------------------
  function initScrollReveal() {
    const isReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elements = document.querySelectorAll('.reveal');
    if (elements.length === 0) return;

    if (isReduced || !('IntersectionObserver' in window)) {
      elements.forEach(function (el) {
        el.classList.add('is-revealed');
      });
      return;
    }

    // Only apply pre-reveal hidden state after confirming IntersectionObserver exists
    document.documentElement.classList.add('js-reveal');

    // 2-second safety timeout that reveals everything regardless
    setTimeout(function () {
      document.querySelectorAll('.reveal').forEach(function (el) {
        el.classList.add('is-revealed');
      });
    }, 2000);

    const observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const el = entry.target;
            el.classList.add('is-revealed');
            obs.unobserve(el);
            // Clear stagger delay so hover transitions are not delayed
            if (el.style.transitionDelay) {
              setTimeout(function () { el.style.transitionDelay = ''; }, 1000);
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    // Stagger siblings: up to 6 items, 70ms apart
    const siblingCount = new Map();
    elements.forEach(function (el) {
      const i = siblingCount.get(el.parentNode) || 0;
      siblingCount.set(el.parentNode, i + 1);
      if (i > 0) el.style.transitionDelay = Math.min(i, 5) * 70 + 'ms';
      observer.observe(el);
    });
  }

  // -------------------------------------------------------------------------
  // 7. Click-to-load Interactive Map
  // -------------------------------------------------------------------------
  function initClickToLoadMap() {
    const container = document.querySelector('.map-container');
    if (!container) return;

    const placeholder = container.querySelector('.map-placeholder');
    if (!placeholder) return;

    placeholder.addEventListener('click', function () {
      const embedUrl = container.getAttribute('data-map-url');
      if (!embedUrl) return;

      const iframe = document.createElement('iframe');
      iframe.className = 'map-iframe';
      iframe.src = embedUrl;
      iframe.title = 'NSG Royal Resort Location Map';
      iframe.loading = 'lazy';
      iframe.allowFullscreen = true;

      container.innerHTML = '';
      container.appendChild(iframe);
    });
  }

  // -------------------------------------------------------------------------
  // 8. Compact Date Bar (Carries dates to book.html)
  // -------------------------------------------------------------------------
  function initDateBar() {
    const form = document.querySelector('.date-bar-form');
    if (!form) return;

    // Set default check-in tomorrow, check-out day after
    const checkInInput = form.querySelector('[name="checkIn"]');
    const checkOutInput = form.querySelector('[name="checkOut"]');

    if (checkInInput && !checkInInput.value) {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const dayAfter = new Date(today);
      dayAfter.setDate(today.getDate() + 2);

      const fmt = (d) => d.toISOString().split('T')[0];
      checkInInput.min = fmt(today);
      checkInInput.value = fmt(tomorrow);

      if (checkOutInput) {
        checkOutInput.min = fmt(tomorrow);
        checkOutInput.value = fmt(dayAfter);

        checkInInput.addEventListener('change', function () {
          if (checkInInput.value >= checkOutInput.value) {
            const next = new Date(checkInInput.value);
            next.setDate(next.getDate() + 1);
            checkOutInput.value = fmt(next);
            checkOutInput.min = checkInInput.value;
          }
        });
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const checkIn = checkInInput ? checkInInput.value : '';
      const checkOut = checkOutInput ? checkOutInput.value : '';
      const guestsInput = form.querySelector('[name="guests"]');
      const guests = guestsInput ? guestsInput.value : '2';

      const query = new URLSearchParams({
        type: 'stay',
        package: 'whole',
        checkIn: checkIn,
        checkOut: checkOut,
        guests: guests
      });

      window.location.href = `book.html?${query.toString()}`;
    });
  }

  // -------------------------------------------------------------------------
  // 9. Live Package Prices on Home, Stay and Book ([data-pkg] cards, from api.getInfo)
  // -------------------------------------------------------------------------
  function initPackagePrices() {
    const cards = document.querySelectorAll('[data-pkg]');
    const guestEls = document.querySelectorAll('[data-pkg-guests]');
    if (!cards.length && !guestEls.length) return;
    const labels = (window.NSG.UI && window.NSG.UI.labels) || {};
    const config = window.NSG.CONFIG || {};
    const wa = config.WHATSAPP && !String(config.WHATSAPP).startsWith('[TBD') ? 'https://wa.me/' + config.WHATSAPP : '';
    const waLink = `<a href="${wa || 'contact.html'}"${wa ? ' target="_blank" rel="noopener noreferrer"' : ''}>${labels.askOnWhatsApp} &rarr;</a>`;

    function render(packages) {
      const byId = {};
      (packages || []).forEach((p) => { byId[p.id] = p; });
      cards.forEach((card) => {
        const pkg = byId[card.getAttribute('data-pkg')];
        const live = !!(pkg && pkg.weekdayRate);
        const price = card.querySelector('[data-pkg-price]');
        const adv = card.querySelector('[data-pkg-advance]');
        card.classList.remove('is-loading');
        card.classList.toggle('is-on-request', !live);
        if (price) price.textContent = live ? pkg.weekdayRate.toLocaleString('en-IN') : labels.priceOnRequest;
        if (adv) {
          if (live && pkg.advance) adv.textContent = '₹' + pkg.advance.toLocaleString('en-IN') + ' ' + labels.advanceRequired;
          else adv.innerHTML = waLink;
        }
      });
      guestEls.forEach((el) => {
        const pkg = byId[el.getAttribute('data-pkg-guests')];
        const text = el.getAttribute('data-text') || '';
        el.textContent = pkg && pkg.maxGuests ? text.replace(/\[TBD:[^\]]*\]/, pkg.maxGuests) : text.split(' · ')[0];
      });
    }

    if (!window.NSG.api || typeof window.NSG.api.getInfo !== 'function') return render(null);
    window.NSG.api.getInfo().then((res) => render(res && res.ok && res.data ? res.data.packages : null), () => render(null));
  }

  // -------------------------------------------------------------------------
  // 9b. Food package cards ([data-food-packages], live from api.addons; empty = hidden)
  // -------------------------------------------------------------------------
  function initFoodPackages() {
    const boxes = document.querySelectorAll('[data-food-packages]');
    if (!boxes.length || !window.NSG.api || typeof window.NSG.api.addons !== 'function') return;
    const labels = (window.NSG.UI && window.NSG.UI.labels) || {};
    const config = window.NSG.CONFIG || {};
    const wa = config.WHATSAPP && !String(config.WHATSAPP).startsWith('[TBD') ? 'https://wa.me/' + config.WHATSAPP : 'contact.html';
    const units = { per_guest: labels.unitPerPerson, flat: labels.unitPerBooking, per_night: labels.unitPerNight, per_qty: labels.unitEach };
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    window.NSG.api.addons().then((res) => {
      const food = res && res.ok ? res.data.filter((a) => a.category === 'food') : [];
      boxes.forEach((box) => {
        const limit = parseInt(box.getAttribute('data-limit'), 10) || food.length;
        box.innerHTML = food.slice(0, limit).map((a) => {
          const priced = a.price !== null;
          return `<article class="food-card">
            <h3 class="food-card-title">${esc(a.name)}</h3>
            <p class="food-card-desc">${esc(a.description)}</p>
            <p class="food-card-price">${priced ? '₹' + a.price.toLocaleString('en-IN') + ' <span class="food-card-unit">' + esc(units[a.unit] || '') + '</span>' : esc(labels.priceOnRequest)}</p>
            ${a.confirmRequired ? '<p class="food-card-note">' + esc(labels.subjectToConfirmation) + '</p>' : ''}
            ${priced
              ? '<a class="btn btn-secondary btn-sm" href="book.html?addons=' + encodeURIComponent(a.id) + '">' + esc(labels.addToBooking) + '</a>'
              : '<a class="btn btn-secondary btn-sm" href="' + wa + '"' + (wa.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(labels.askOnWhatsApp) + '</a>'}
          </article>`;
        }).join('');
      });
    });
  }

  // -------------------------------------------------------------------------
  // 10. Contact Enquiry Form (reuses api.eventEnquiry, eventType "other")
  // -------------------------------------------------------------------------
  function initContactForm() {
    const form = document.getElementById('contact-enquiry-form');
    if (!form) return;

    const errAlert = document.getElementById('ct-error-alert');
    const submitBtn = document.getElementById('ct-submit-btn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errAlert) errAlert.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      const nameInput = form.querySelector('[name="name"]');
      const phoneInput = form.querySelector('[name="phone"]');
      const emailInput = form.querySelector('[name="email"]');
      const notesInput = form.querySelector('[name="notes"]');
      const hpInput = form.querySelector('[name="_hp"]');

      let firstInvalid = null;
      form.querySelectorAll('.form-group').forEach((g) => g.classList.remove('has-error'));

      if (!nameInput || !nameInput.value.trim()) {
        if (nameInput) nameInput.closest('.form-group').classList.add('has-error');
        if (!firstInvalid && nameInput) firstInvalid = nameInput;
      }
      const cleanPhone = String(phoneInput ? phoneInput.value : '').trim().replace(/[\s\-]/g, '');
      if (!/^\d{10}$/.test(cleanPhone)) {
        if (phoneInput) phoneInput.closest('.form-group').classList.add('has-error');
        if (!firstInvalid && phoneInput) firstInvalid = phoneInput;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
        return;
      }

      const payload = {
        name: nameInput.value.trim(),
        phone: cleanPhone,
        email: (emailInput && emailInput.value.trim()) || '',
        eventType: 'other',
        eventDate: '',
        guests: 0,
        notes: 'General enquiry: ' + ((notesInput && notesInput.value.trim()) || ''),
        _hp: hpInput ? hpInput.value : ''
      };

      const api = (window.NSG && window.NSG.api) || {};
      if (typeof api.eventEnquiry !== 'function') {
        if (errAlert) {
          errAlert.textContent = 'Booking service unavailable. Please contact us on WhatsApp.';
          errAlert.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
        return;
      }

      try {
        const res = await api.eventEnquiry(payload);
        if (!res.ok) {
          if (errAlert) {
            errAlert.textContent = res.error || 'Enquiry could not be submitted. Please try again.';
            errAlert.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Enquiry &rarr;';
          }
          return;
        }
        form.reset();
        if (errAlert) {
          errAlert.textContent = res.data && res.data.message ? res.data.message : 'Enquiry received! We will contact you shortly.';
          errAlert.style.display = 'block';
          errAlert.style.color = 'var(--ok)';
        }
      } catch (err) {
        if (errAlert) {
          errAlert.textContent = 'Connection error. Please try again or reach out on WhatsApp.';
          errAlert.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // 11. Event Enquiry Form (calls api.eventEnquiry)
  // -------------------------------------------------------------------------
  function initEventForm() {
    const form = document.getElementById('event-enquiry-form');
    if (!form) return;

    const errAlert = document.getElementById('ev-error-alert');
    const submitBtn = document.getElementById('ev-submit-btn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errAlert) errAlert.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      const nameInput = form.querySelector('[name="name"]');
      const phoneInput = form.querySelector('[name="phone"]');
      const emailInput = form.querySelector('[name="email"]');
      const eventTypeInput = form.querySelector('[name="eventType"]');
      const eventDateInput = form.querySelector('[name="eventDate"]');
      const guestsInput = form.querySelector('[name="guests"]');
      const notesInput = form.querySelector('[name="notes"]');
      const hpInput = form.querySelector('[name="_hp"]');

      let firstInvalid = null;
      form.querySelectorAll('.form-group').forEach((g) => g.classList.remove('has-error'));

      if (!nameInput || !nameInput.value.trim()) {
        if (nameInput) nameInput.closest('.form-group').classList.add('has-error');
        if (!firstInvalid && nameInput) firstInvalid = nameInput;
      }
      const cleanPhone = String(phoneInput ? phoneInput.value : '').trim().replace(/[\s\-]/g, '');
      if (!/^\d{10}$/.test(cleanPhone)) {
        if (phoneInput) phoneInput.closest('.form-group').classList.add('has-error');
        if (!firstInvalid && phoneInput) firstInvalid = phoneInput;
      }
      if (!eventTypeInput || !eventTypeInput.value) {
        if (eventTypeInput) eventTypeInput.closest('.form-group').classList.add('has-error');
        if (!firstInvalid && eventTypeInput) firstInvalid = eventTypeInput;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
        return;
      }

      const payload = {
        name: nameInput.value.trim(),
        phone: cleanPhone,
        email: (emailInput && emailInput.value.trim()) || '',
        eventType: eventTypeInput.value,
        eventDate: (eventDateInput && eventDateInput.value) || '',
        guests: Number(guestsInput ? guestsInput.value : 0) || 0,
        notes: (notesInput && notesInput.value.trim()) || '',
        _hp: hpInput ? hpInput.value : ''
      };

      const api = (window.NSG && window.NSG.api) || {};
      if (typeof api.eventEnquiry !== 'function') {
        if (errAlert) {
          errAlert.textContent = 'Booking service unavailable. Please contact us on WhatsApp.';
          errAlert.style.display = 'block';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
        return;
      }

      try {
        const res = await api.eventEnquiry(payload);
        if (!res.ok) {
          if (errAlert) {
            errAlert.textContent = res.error || 'Enquiry could not be submitted. Please try again.';
            errAlert.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Enquiry &rarr;';
          }
          return;
        }
        form.reset();
        if (errAlert) {
          errAlert.textContent = res.data && res.data.message ? res.data.message : 'Enquiry received! We will contact you shortly.';
          errAlert.style.display = 'block';
          errAlert.style.color = 'var(--ok)';
        }
      } catch (err) {
        if (errAlert) {
          errAlert.textContent = 'Connection error. Please try again or reach out on WhatsApp.';
          errAlert.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry &rarr;';
        }
      }
    });
  }

  // Initialize all independently on DOMContentLoaded wrapped in try/catch
  document.addEventListener('DOMContentLoaded', function () {
    const modules = [
      ['slotLabels', initSlotLabels],
      ['headerScroll', initHeaderScroll],
      ['mobileMenu', initMobileMenu],
      ['packageSliders', initPackageSliders],
      ['scrollReveal', initScrollReveal],
      ['clickToLoadMap', initClickToLoadMap],
      ['dateBar', initDateBar],
      ['packagePrices', initPackagePrices],
      ['foodPackages', initFoodPackages],
      ['contactForm', initContactForm],
      ['eventForm', initEventForm]
    ];

    modules.forEach(function (m) {
      try {
        m[1]();
      } catch (err) {
        console.warn('Init error in ' + m[0] + ':', err);
      }
    });
  });
})();
