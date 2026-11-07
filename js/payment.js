window.NSG = window.NSG || {};
(function () {
  'use strict';
  function loadQrCodeLib() {
    return new Promise((resolve, reject) => {
      if (typeof window.qrcode === 'function') {
        return resolve();
      }
      const existing = document.querySelector('script[src*="qrcode.js"]');
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'js/vendor/qrcode.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load QR code library'));
      document.head.appendChild(script);
    });
  }
  class PaymentHandler {
    constructor(container, options = {}) {
      this.container = container;
      this.booking = options.booking;
      this.onSuccess = options.onSuccess || function () {};
      this.onRestart = options.onRestart || function () {};
      this.timerInterval = null;
      const mode = (window.NSG.CONFIG && window.NSG.CONFIG.PAYMENT_MODE) || 'upi';
      if (mode !== 'upi') {
        throw new Error('Payment gateway mode is not implemented');
      }
      this.init();
    }
    async init() {
      this.render();
      try {
        await loadQrCodeLib();
        this.renderQrCode();
      } catch (err) {
        console.warn('Could not load QR library:', err);
      }
      this.startCountdown();
    }
    render() {
      const b = this.booking;
      const payment = b.payment || {};
      const amount = b.amount || 0;
      const upiId = payment.upiId || 'nsgresort@upi';
      const upiLink = payment.upiLink || '';
      this.container.innerHTML = `
        <div class="payment-card">
          <div class="payment-header">
            <h3 class="payment-title">Advance Payment Due Now</h3>
            <div class="payment-amount">₹${amount.toLocaleString('en-IN')}</div>
            <p class="payment-note text-muted">
              The advance is a part-payment to secure your dates. The remaining balance of <strong>₹${(b.balance || 0).toLocaleString('en-IN')}</strong> is payable upon arrival at the resort.
            </p>
          </div>
          <!-- Hold Countdown -->
          <div class="hold-countdown-banner" id="hold-countdown-box" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="countdown-icon">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Hold reserved: <strong id="hold-countdown-timer">--:--</strong></span>
          </div>
          <div id="hold-warning" class="hold-warning" style="display:none;">
            Less than 3 minutes remaining on this hold! Please submit your payment reference.
          </div>
          <!-- QR & UPI Details -->
          <div class="upi-payment-layout">
            <div class="qr-box">
              <div id="upi-qr-container" class="qr-canvas-wrapper" aria-label="UPI Payment QR Code">
                <div class="qr-loading">Generating secure QR...</div>
              </div>
              <p class="qr-caption">Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)</p>
            </div>
            <div class="upi-info-box">
              <div class="upi-field">
                <span class="upi-field-label">UPI ID / VPA</span>
                <div class="upi-copy-row">
                  <code class="upi-id-code" id="upi-id-text">${upiId}</code>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-upi">
                    Copy UPI ID
                  </button>
                </div>
              </div>
              ${
                upiLink
                  ? `<div class="upi-mobile-pay">
                      <a href="${upiLink}" class="btn btn-primary btn-md btn-pay-app" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                          <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                        Pay with UPI App
                      </a>
                    </div>`
                  : ''
              }
            </div>
          </div>
          <!-- UTR Submission Form -->
          <form class="utr-form" id="utr-form" novalidate>
            <div class="form-group" id="utr-group">
              <label for="utr-input" class="form-label">
                UPI Reference / UTR Number <span style="color:var(--err)">*</span>
              </label>
              <input
                type="text"
                id="utr-input"
                name="utr"
                class="form-input"
                placeholder="Enter 8 to 22 character UTR / Txn ID"
                required
                autocomplete="off"
                maxlength="22"
              >
              <span class="form-error" id="utr-error">Please enter a valid 8 to 22 character UTR.</span>
            </div>
            <div id="payment-submit-error" class="payment-error-alert" style="display:none;" role="alert"></div>
            <button type="submit" class="btn btn-primary btn-lg" id="btn-submit-utr" style="width:100%;">
              Submit Payment Reference &rarr;
            </button>
          </form>
          <div class="payment-footer-links">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-start-over">
              &times; Cancel & Start over
            </button>
          </div>
        </div>
      `;
      const copyBtn = this.container.querySelector('#btn-copy-upi');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(upiId).then(() => {
              copyBtn.textContent = 'Copied!';
              setTimeout(() => {
                copyBtn.textContent = 'Copy UPI ID';
              }, 2000);
            });
          }
        });
      }
      const restartBtn = this.container.querySelector('#btn-start-over');
      if (restartBtn) {
        restartBtn.addEventListener('click', () => {
          this.destroy();
          this.onRestart();
        });
      }
      const form = this.container.querySelector('#utr-form');
      form.addEventListener('submit', (e) => this.handleSubmitUtr(e));
    }
    renderQrCode() {
      const qrContainer = this.container.querySelector('#upi-qr-container');
      if (!qrContainer || typeof window.qrcode !== 'function') return;
      const upiLink = (this.booking.payment && this.booking.payment.upiLink) || '';
      if (!upiLink) return;
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(upiLink);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(5, 8);
      } catch (e) {
        console.warn('QR generation error:', e);
      }
    }
    startCountdown() {
      const timerEl = this.container.querySelector('#hold-countdown-timer');
      const warningEl = this.container.querySelector('#hold-warning');
      const boxEl = this.container.querySelector('#hold-countdown-box');
      if (!timerEl) return;
      const expireMs = new Date(this.booking.holdExpiresAt).getTime();
      const updateTimer = () => {
        const now = Date.now();
        const diff = expireMs - now;
        if (diff <= 0) {
          clearInterval(this.timerInterval);
          timerEl.textContent = '00:00 (Expired)';
          if (boxEl) boxEl.classList.add('hold-box--expired');
          this.handleHoldExpired();
          return;
        }
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (mins < 3 && warningEl) {
          warningEl.style.display = 'block';
        }
      };
      updateTimer();
      this.timerInterval = setInterval(updateTimer, 1000);
    }
    handleHoldExpired() {
      const submitBtn = this.container.querySelector('#btn-submit-utr');
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      const errAlert = this.container.querySelector('#payment-submit-error');
      if (errAlert) {
        errAlert.innerHTML = `
          This reservation hold has expired. The dates have been released.
          <br><button type="button" class="btn btn-secondary btn-sm" id="btn-restart-expired" style="margin-top:8px;">Start Over</button>
        `;
        errAlert.style.display = 'block';
        const reBtn = errAlert.querySelector('#btn-restart-expired');
        if (reBtn) reBtn.addEventListener('click', () => this.onRestart());
      }
    }
    async handleSubmitUtr(e) {
      e.preventDefault();
      const input = this.container.querySelector('#utr-input');
      const group = this.container.querySelector('#utr-group');
      const errSpan = this.container.querySelector('#utr-error');
      const errAlert = this.container.querySelector('#payment-submit-error');
      const submitBtn = this.container.querySelector('#btn-submit-utr');
      const val = input.value.trim();
      if (!/^[A-Za-z0-9]{8,22}$/.test(val)) {
        group.classList.add('has-error');
        errSpan.textContent = 'UTR must be 8 to 22 alphanumeric characters.';
        input.focus();
        return;
      }
      group.classList.remove('has-error');
      errAlert.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting reference...';
      try {
        const res = await window.NSG.api.submitPayment(this.booking.bookingId, val);
        if (!res.ok) {
          errAlert.textContent = res.error || 'Payment reference verification failed.';
          errAlert.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Payment Reference →';
          return;
        }
        clearInterval(this.timerInterval);
        this.onSuccess({
          bookingId: this.booking.bookingId,
          utr: val,
          message: res.data.message
        });
      } catch (err) {
        errAlert.textContent = 'Network connection issue. Please verify your connection and retry.';
        errAlert.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Payment Reference →';
      }
    }
    destroy() {
      if (this.timerInterval) clearInterval(this.timerInterval);
    }
  }
  window.NSG.PaymentHandler = PaymentHandler;
})();
