/**
 * NSG ROYAL RESORT — GALLERY PAGE
 * gallery.js: Filter chips, lightbox with keyboard/swipe/focus trap, and past-event
 * YouTube videos (.video-card) played inside the same lightbox (Gallery, Events, Home).
 */
window.NSG = window.NSG || {};

(function () {
  'use strict';

  const grid = document.getElementById('gallery-grid');
  const filters = document.querySelectorAll('#gallery-filters .chip');
  const comingSoon = document.getElementById('gallery-coming-soon');

  // -------------------------------------------------------------------------
  // 1. Filter chips
  // -------------------------------------------------------------------------
  function initFilters() {
    filters.forEach((chip) => {
      chip.addEventListener('click', function () {
        filters.forEach((c) => {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
        this.classList.add('is-active');
        this.setAttribute('aria-pressed', 'true');

        const cat = this.getAttribute('data-cat');
        const items = grid ? grid.querySelectorAll('.gallery-item') : [];
        let visible = 0;

        items.forEach((item) => {
          if (cat === 'all' || item.getAttribute('data-cat') === cat) {
            item.style.display = 'block';
            visible++;
          } else {
            item.style.display = 'none';
          }
        });

        if (comingSoon) {
          comingSoon.style.display = visible === 0 ? 'block' : 'none';
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 2. Lightbox
  // -------------------------------------------------------------------------
  const lightbox = document.getElementById('gallery-lightbox');
  const lightboxImg = lightbox ? lightbox.querySelector('.lightbox-img') : null;
  const lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;
  const lightboxPrev = lightbox ? lightbox.querySelector('.lightbox-prev') : null;
  const lightboxNext = lightbox ? lightbox.querySelector('.lightbox-next') : null;

  let currentIndex = 0;
  let galleryItems = [];

  function openLightbox(index) {
    if (!lightbox || !lightboxImg) return;
    currentIndex = index;
    const item = galleryItems[currentIndex];
    const imgEl = item.querySelector('img');
    if (imgEl) {
      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt;
    }
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    trapFocus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // Closing removes the video iframe so playback stops
    lightbox.classList.remove('is-video');
    lightbox.querySelectorAll('.lightbox-video, .lightbox-yt-link').forEach((el) => el.remove());
    if (videoOpener) {
      videoOpener.focus();
      videoOpener = null;
    }
  }

  // Video mode: the youtube-nocookie iframe is inserted only when the lightbox opens
  let videoOpener = null;
  function openFileVideo(tile) {
    if (!lightbox) return;
    const content = lightbox.querySelector('.lightbox-content');
    const frame = document.createElement('div');
    frame.className = 'lightbox-video lightbox-video--file';
    const v = document.createElement('video');
    v.controls = true;
    v.playsInline = true;
    v.autoplay = true;
    v.poster = tile.getAttribute('data-poster') || '';
    v.src = tile.getAttribute('data-src');
    v.setAttribute('aria-label', tile.getAttribute('data-title') || '');
    frame.appendChild(v);
    content.appendChild(frame);
    videoOpener = tile.querySelector('.vf-open');
    lightbox.classList.add('is-video');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    trapFocus();
  }
  function openVideo(card) {
    const id = card.getAttribute('data-yt-id');
    if (!lightbox || !/^[A-Za-z0-9_-]{11}$/.test(id || '')) return;
    const content = lightbox.querySelector('.lightbox-content');
    const title = card.getAttribute('data-title') || lightbox.getAttribute('data-video-title') || '';
    const frame = document.createElement('div');
    frame.className = 'lightbox-video';
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    iframe.title = title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    // For videos whose owners block embedding
    const link = document.createElement('a');
    link.className = 'lightbox-yt-link';
    link.href = 'https://www.youtube.com/watch?v=' + id;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = lightbox.getAttribute('data-watch-label') || 'Watch on YouTube';
    content.appendChild(frame);
    content.appendChild(link);
    videoOpener = card;
    lightbox.classList.add('is-video');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    trapFocus();
  }

  function prevImage() {
    currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
    updateLightboxImage();
  }

  function nextImage() {
    currentIndex = (currentIndex + 1) % galleryItems.length;
    updateLightboxImage();
  }

  function updateLightboxImage() {
    if (!lightboxImg || !galleryItems[currentIndex]) return;
    const imgEl = galleryItems[currentIndex].querySelector('img');
    if (imgEl) {
      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Focus trap for lightbox
  // -------------------------------------------------------------------------
  const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trapFocus() {
    if (!lightbox) return;
    // Visible controls only (prev/next are hidden while a video plays)
    const focusable = Array.from(lightbox.querySelectorAll(focusableSelectors)).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handler(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    lightbox.addEventListener('keydown', handler);
    lightbox._focusHandler = handler;
    first.focus();
  }

  function untrapFocus() {
    if (!lightbox || !lightbox._focusHandler) return;
    lightbox.removeEventListener('keydown', lightbox._focusHandler);
    lightbox._focusHandler = null;
  }

  // -------------------------------------------------------------------------
  // 4. Keyboard + swipe
  // -------------------------------------------------------------------------
  let lightboxReady = false;
  function initLightbox() {
    if (!lightbox || lightboxReady) return;
    lightboxReady = true;

    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', prevImage);
    lightboxNext.addEventListener('click', nextImage);

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (lightbox.getAttribute('aria-hidden') === 'false') {
        if (e.key === 'Escape') closeLightbox();
        if (lightbox.classList.contains('is-video')) return;
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
      }
    });

    // Swipe support
    let startX = 0;
    let startY = 0;
    lightbox.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].screenX;
      startY = e.changedTouches[0].screenY;
    }, { passive: true });

    lightbox.addEventListener('touchend', function (e) {
      const endX = e.changedTouches[0].screenX;
      const endY = e.changedTouches[0].screenY;
      const diffX = endX - startX;
      const diffY = endY - startY;
      if (!lightbox.classList.contains('is-video') && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) prevImage(); else nextImage();
      }
    }, { passive: true });
  }

  // -------------------------------------------------------------------------
  // 5. Init
  // -------------------------------------------------------------------------
  function initGallery() {
    if (!grid) return;

    galleryItems = Array.from(grid.querySelectorAll('.gallery-item:not(.gallery-item--video)'));
    const visibleCount = galleryItems.filter((it) => it.style.display !== 'none').length;

    if (comingSoon) {
      comingSoon.style.display = galleryItems.length === 0 ? 'block' : 'none';
    }

    initFilters();
    initLightbox();

    // Make images clickable to open lightbox
    galleryItems.forEach((item, index) => {
      const img = item.querySelector('img');
      if (img) {
        img.style.cursor = 'pointer';
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', 'Open image in lightbox');
        img.addEventListener('click', function () {
          openLightbox(index);
        });
      }
    });
  }

  function initVideos() {
    const cards = document.querySelectorAll('.video-card');
    if (!cards.length || !lightbox) return;
    initLightbox();
    cards.forEach((card) => card.addEventListener('click', () => openVideo(card)));
  }

  document.addEventListener('DOMContentLoaded', initGallery);
  document.addEventListener('DOMContentLoaded', initVideos);

  // Featured self-hosted video: muted loop while at least half visible; never autoplays
  // under reduced motion or Data Saver (poster + play button instead)
  function initFeatureVideos() {
    const tiles = document.querySelectorAll('[data-video-feature]');
    if (!tiles.length) return;
    initLightbox();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const autoplay = !reduced && !saveData;
    const io = autoplay && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const tile = e.target;
        if (tile.dataset.userPaused === '1') return;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) play(tile);
        else pause(tile);
      });
    }, { threshold: [0, 0.5] }) : null;

    function sync(tile) {
      const v = tile.querySelector('video');
      const playBtn = tile.querySelector('.vf-play');
      const muteBtn = tile.querySelector('.vf-mute');
      tile.classList.toggle('is-playing', !v.paused);
      tile.classList.toggle('is-unmuted', !v.muted);
      playBtn.setAttribute('aria-label', v.paused ? playBtn.dataset.labelPlay : playBtn.dataset.labelPause);
      muteBtn.setAttribute('aria-label', v.muted ? muteBtn.dataset.labelUnmute : muteBtn.dataset.labelMute);
    }
    function play(tile) {
      const v = tile.querySelector('video');
      if (v.preload !== 'auto') v.preload = 'auto';
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
    function pause(tile) {
      tile.querySelector('video').pause();
    }

    tiles.forEach((tile) => {
      const v = tile.querySelector('video');
      const cap = tile.querySelector('.vf-caption');
      if (cap && cap.textContent.indexOf('[TBD') !== -1) cap.hidden = true;
      if (!autoplay) tile.classList.add('no-autoplay');
      ['play', 'pause', 'volumechange'].forEach((ev) => v.addEventListener(ev, () => sync(tile)));
      tile.querySelector('.vf-play').addEventListener('click', () => {
        if (v.paused) { tile.dataset.userPaused = ''; play(tile); }
        else { tile.dataset.userPaused = '1'; pause(tile); }
      });
      tile.querySelector('.vf-mute').addEventListener('click', () => {
        v.muted = !v.muted;
        if (!v.muted && v.paused) play(tile);
      });
      tile.querySelector('.vf-open').addEventListener('click', () => {
        pause(tile);
        tile.dataset.userPaused = '1';
        openFileVideo(tile);
      });
      if (io) io.observe(tile);
      sync(tile);
    });
  }
  document.addEventListener('DOMContentLoaded', initFeatureVideos);
})();
