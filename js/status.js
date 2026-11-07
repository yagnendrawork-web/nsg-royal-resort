/**
 * NSG ROYAL RESORT — STATUS PAGE CONTROLLER
 * status.js: Handles booking lookup by ID + last 4 phone digits (SPEC Section 9)
 */

window.NSG = window.NSG || {};

(function () {
  'use strict';

  function getQueryParam(key) {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get(key) || '';
    } catch (e) {
      return '';
    }
  }

  function getStatusBadgeHtml(status) {
    switch (status) {
      case 'CONFIRMED':
        return '<span class="badge badge-ok">Confirmed</span>';
      case 'PAYMENT_SUBMITTED':
        return '<span class="badge badge-warn">Awaiting Confirmation</span>';
      case 'HOLD':
        return '<span class="badge badge-warn">Awaiting Payment</span>';
      case 'REJECTED':
        return '<span class="badge badge-err">Payment Rejected</span>';
      case 'CANCELLED':
        return '<span class="badge badge-err">Cancelled</span>';
      case 'EXPIRED':
        return '<span class="badge badge-neutral">Hold Expired</span>';
      default:
        return `<span class="badge badge-neutral">${status || 'Pending'}</span>`;
    }
  }

  function initStatusLookup() {
    const form = document.getElementById('status-lookup-form');
    const idInput = document.getElementById('lookup-id');
    const last4Input = document.getElementById('lookup-last4');
    const resultContainer = document.getElementById('status-result-container');
    const errAlert = document.getElementById('status-error-alert');
    const submitBtn = document.getElementById('btn-status-submit');

    if (!form) return;

    // Prefill ID from query parameter ?id=
    const prefillId = getQueryParam('id');
    if (prefillId && idInput) {
      idInput.value = prefillId;
      if (last4Input) last4Input.focus();
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const bookingId = idInput.value.trim();
      const phoneLast4 = last4Input.value.trim();

      if (!bookingId) {
        idInput.focus();
        return;
      }
      if (!/^\d{4}$/.test(phoneLast4)) {
        last4Input.focus();
        return;
      }

      errAlert.style.display = 'none';
      resultContainer.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying details...';

      try {
        const res = await window.NSG.api.getBooking(bookingId, phoneLast4);

        if (!res.ok) {
          errAlert.textContent =
            (window.NSG.UI && window.NSG.UI.errors && window.NSG.UI.errors.NOT_FOUND) ||
            'We could not find a booking matching those details. Please check your Booking ID and phone number, or reach out to us on WhatsApp.';
          errAlert.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Check Status';
          return;
        }

        const b = res.data;
        renderBookingStatus(b, resultContainer);
        resultContainer.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check Status';
      } catch (err) {
        errAlert.textContent = 'Connection error. Please try again or reach out on WhatsApp.';
        errAlert.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check Status';
      }
    });
  }

  function renderBookingStatus(booking, container) {
    const statusBadge = getStatusBadgeHtml(booking.status);
    const packageName = booking.packageName || (booking.packageId === 'whole' ? 'Whole Resort' : 'Penthouse + Pool & Turf');
    const checkInTime = '11 AM';
    const checkOutTime = '10 AM';
    // Add-ons and totals (older bookings have none, so nothing changes for them)
    const addonUi = (window.NSG.UI && window.NSG.UI.addons) || {};
    const addons = Array.isArray(booking.addons) ? booking.addons : [];
    const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const isEvent = booking.bookingType === 'event';
    const addonsHtml = !addons.length ? '' : `
          <div class="receipt-item receipt-item--wide">
            <span class="receipt-label">${escHtml(addonUi.statusTitle)}${isEvent ? ' (' + escHtml(addonUi.eventNote) + ')' : ''}</span>
            <span class="receipt-value">${addons.map((a) => `${escHtml(a.name)} × ${a.qty} = ₹${Number(a.lineTotal || 0).toLocaleString('en-IN')}${a.confirmRequired ? ' (' + escHtml(addonUi.subjectToConfirmation) + ')' : ''}`).join('<br>')}</span>
          </div>
          <div class="receipt-item">
            <span class="receipt-label">${escHtml(addonUi.rowAddonsTotal)}</span>
            <span class="receipt-value">₹${Number(booking.addonsTotal || 0).toLocaleString('en-IN')}</span>
          </div>${!isEvent && booking.total ? `
          <div class="receipt-item">
            <span class="receipt-label">${escHtml(addonUi.statusTotal)}</span>
            <span class="receipt-value" style="font-weight:700;">₹${Number(booking.total).toLocaleString('en-IN')}</span>
          </div>` : ''}`;

    container.innerHTML = `
      <div class="booking-receipt-card" id="booking-receipt">
        <div class="receipt-header">
          <div>
            <span class="receipt-subtitle">Official Reservation</span>
            <h2 class="receipt-title">Booking Confirmation</h2>
            <div class="receipt-id">Reference ID: <strong>${booking.bookingId}</strong></div>
          </div>
          <div class="receipt-badge-wrap">
            ${statusBadge}
          </div>
        </div>

        <hr class="receipt-divider">

        <div class="receipt-grid">
          <div class="receipt-item">
            <span class="receipt-label">Guest Name</span>
            <span class="receipt-value">${booking.name}</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Experience</span>
            <span class="receipt-value">${packageName}</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Check-In</span>
            <span class="receipt-value">${booking.checkIn} (from ${checkInTime})</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Check-Out</span>
            <span class="receipt-value">${booking.checkOut} (until ${checkOutTime})</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Duration</span>
            <span class="receipt-value">${booking.nights} ${booking.nights === 1 ? 'Night' : 'Nights'}</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Guests</span>
            <span class="receipt-value">${booking.guests} Guests</span>
          </div>

          ${addonsHtml}
          <div class="receipt-item">
            <span class="receipt-label">Advance Paid</span>
            <span class="receipt-value" style="color:var(--ok);font-weight:700;">₹${(booking.amount || 0).toLocaleString('en-IN')}</span>
          </div>

          <div class="receipt-item">
            <span class="receipt-label">Balance on Arrival</span>
            <span class="receipt-value" style="font-weight:700;">₹${(booking.balance || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="receipt-property-info">
          <strong>NSG Royal Resort</strong> · Nidigattu, Bheemunipatnam, Bheemili
        </div>

        <div class="receipt-actions no-print">
          <button type="button" class="btn btn-secondary btn-md" onclick="window.print()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / Save as PDF
          </button>
        </div>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', initStatusLookup);
})();
