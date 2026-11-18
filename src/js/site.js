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
    const file = ((window.NSG && window.NSG.IMG_USE) || {})[slotName] || slotName;
    const widths = manifest[file];
    const safeAlt = alt || slotName;
    const safeClass = className ? ` ${className}` : '';

    if (widths && widths.length > 0) {
      if (slotName === 'og-image') {
        return `<img class="slot-img${safeClass}" src="assets/img/og-image.jpg" width="1200" height="630" alt="${safeAlt}">`;
      }
      const srcset = widths.map((w) => `assets/img/${file}-${w}.webp ${w}w`).join(', ');
      const src = `assets/img/${file}-${widths[0]}.webp`;
      return `<img class="slot-img${safeClass}" src="${src}" srcset="${srcset}" alt="${safeAlt}" loading="lazy" decoding="async">`;
    }

    return `<div class="slot-ph${safeClass}" data-slot="${slotName}" data-label="${slotName}">
      <div class="slot-ph-content">
        <span class="slot-ph-label">${slotName}</span>
      </div>
    </div>`;
  };

  // Brand loader markup for scripts (cloned from the footer's <template>; partials/loader.html); size 'sm' = 30px
  window.NSG.loader = function (size) {
    const tpl = document.getElementById('nsg-loader-tpl');
    const html = tpl ? tpl.innerHTML.trim() : '';
    return size === 'sm' ? html.replace('class="nsg-loader"', 'class="nsg-loader nsg-loader--sm"') : html;
  };

  // A photo that fails to load becomes the branded frame (logo and name), same size and alt text
  function initBrokenImages() {
    const swap = function (img) {
      if (!img || img.tagName !== 'IMG' || !img.classList.contains('slot-img') || img.dataset.broken) return;
      img.dataset.broken = '1';
      const ph = document.createElement('div');
      ph.className = img.className.replace('slot-img', 'slot-ph');
      ph.setAttribute('role', 'img');
      if (img.alt) ph.setAttribute('aria-label', img.alt);
      ph.style.cssText = img.style.cssText;
      ph.innerHTML = '<div class="slot-ph-content"></div>';
      img.replaceWith(ph);
    };
    document.addEventListener('error', function (e) { swap(e.target); }, true);
    document.querySelectorAll('img.slot-img').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) swap(img);
    });
  }

  // [data-wa-text] links open WhatsApp with that message (the contact page while the number is not set)
  function initWhatsAppText() {
    const n = String((window.NSG.CONFIG || {}).WHATSAPP || '');
    document.querySelectorAll('[data-wa-text]').forEach(function (a) {
      a.href = n && n.indexOf('[TBD') !== 0 ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(a.getAttribute('data-wa-text')) : 'contact.html';
    });
  }

  // Car nudge: once per visit, from the second page and after a short read, a small card suggests the cars page.
  // Not on the cars, booking, pay, staff or status pages; never over an open sheet, lightbox or selection bar.
  // "Dismiss" hides it for 7 days. Text: site.json ui.carNudge.
  function initCarNudge() {
    const t = window.NSG.UI && window.NSG.UI.carNudge;
    const cfg = window.NSG.CONFIG || {};
    if (!t || !(cfg.FEATURES && cfg.FEATURES.cars)) return;
    if (/(^|\/)(cars|book|pay|staff|status)\.html$/.test(location.pathname)) return;
    let off = 0;
    let views = 0;
    try {
      off = Number(localStorage.getItem('nsg_car_nudge_off')) || 0;
      views = Number(sessionStorage.getItem('nsg_views') || 0) + 1;
      sessionStorage.setItem('nsg_views', String(views));
      if (sessionStorage.getItem('nsg_car_nudge_shown')) return;
    } catch (e) { return; }
    if (views < 2 || Date.now() < off) return;
    setTimeout(function () {
      const b = document.body;
      if (b.classList.contains('has-svc-sheet') || b.classList.contains('has-svc-bar') || b.classList.contains('has-fp-summary') || document.querySelector('.lightbox[aria-hidden="false"]')) return;
      try { sessionStorage.setItem('nsg_car_nudge_shown', '1'); } catch (e) {}
      const el = document.createElement('aside');
      el.className = 'car-nudge';
      el.setAttribute('aria-labelledby', 'car-nudge-title');
      el.innerHTML = '<span class="car-nudge-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 16v-3.5L6 7h12l2 5.5V16M4 16h16M4 16v2.5h3V16M17 16v2.5h3V16M4 12.5h16"/></svg></span>'
        + '<div class="car-nudge-body"><p class="car-nudge-title" id="car-nudge-title"></p><p class="car-nudge-text"></p><a class="btn btn-primary btn-sm" href="cars.html" data-cta="nudge:cars"></a></div>'
        + '<button type="button" class="car-nudge-x"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
      el.querySelector('.car-nudge-title').textContent = t.title;
      el.querySelector('.car-nudge-text').textContent = t.text;
      el.querySelector('a').textContent = t.cta;
      el.querySelector('.car-nudge-x').setAttribute('aria-label', t.close);
      el.querySelector('.car-nudge-x').addEventListener('click', function () {
        try { localStorage.setItem('nsg_car_nudge_off', String(Date.now() + 7 * 864e5)); } catch (e) {}
        el.remove();
      });
      b.appendChild(el);
    }, 7000);
  }

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
        checkIn: checkIn,
        checkOut: checkOut,
        guests: guests
      });

      window.location.href = `book.html?${query.toString()}`;
    });
  }

  // -------------------------------------------------------------------------
  // 9. Package info: pages with package cards start the (slow) Apps Script call at once, before packages.js
  //    loads (Home loads it lazily); api.getInfo() shares the one request and the localStorage copy
  // -------------------------------------------------------------------------
  function initPackageInfoEarly() {
    if (document.querySelector('[data-packages]') && window.NSG.api && window.NSG.api.getInfo) window.NSG.api.getInfo();
  }

  // -------------------------------------------------------------------------
  // 9b. "Food packages from ₹X per person, minimum N" ([data-food-from], live from api.addons)
  // -------------------------------------------------------------------------
  function initFoodPackages() {
    const els = document.querySelectorAll('[data-food-from]');
    if (!els.length || !window.NSG.api || typeof window.NSG.api.addons !== 'function') return;
    window.NSG.api.addons().then((res) => {
      const food = res && res.ok ? res.data.filter((a) => a.category === 'food' && a.price !== null) : [];
      if (!food.length) return;
      const cheapest = food.reduce((m, a) => (a.price < m.price ? a : m));
      els.forEach((el) => {
        el.textContent = (el.getAttribute('data-template') || '')
          .replace('{price}', '₹' + cheapest.price.toLocaleString('en-IN'))
          .replace('{min}', cheapest.minQty || 1);
        el.hidden = false;
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
      ['brokenImages', initBrokenImages],
      ['whatsAppText', initWhatsAppText],
      ['carNudge', initCarNudge],
      ['headerScroll', initHeaderScroll],
      ['mobileMenu', initMobileMenu],
      ['packageSliders', initPackageSliders],
      ['packageInfoEarly', initPackageInfoEarly],
      ['scrollReveal', initScrollReveal],
      ['clickToLoadMap', initClickToLoadMap],
      ['dateBar', initDateBar],
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
