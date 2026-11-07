window.NSG = window.NSG || {};
(function () {
  'use strict';
  function parseDate(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }
  function formatDate(d) {
    return d.toISOString().split('T')[0];
  }
  function getTodayKolkata() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return formatDate(now);
  }
  function addDays(dStr, n) {
    const d = parseDate(dStr);
    d.setUTCDate(d.getUTCDate() + n);
    return formatDate(d);
  }
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  class Calendar {
    constructor(container, options = {}) {
      this.container = container;
      this.mode = options.mode || 'range';
      this.onSelect = options.onSelect || function () {};
      this.onError = options.onError || function () {};
      this.blockedDates = new Set(options.blockedDates || []);
      this.today = getTodayKolkata();
      this.checkIn = options.checkIn || null;
      this.checkOut = options.checkOut || null;
      const initialDate = this.checkIn ? parseDate(this.checkIn) : parseDate(this.today);
      this.currentYear = initialDate.getUTCFullYear();
      this.currentMonth = initialDate.getUTCMonth();
      this.minYear = parseDate(this.today).getUTCFullYear();
      this.minMonth = parseDate(this.today).getUTCMonth();
      this.hoverDate = null;
      this.render();
    }
    setBlockedDates(dates) {
      this.blockedDates = new Set(dates || []);
      this.render();
    }
    setMode(mode) {
      this.mode = mode;
      if (mode === 'single' && this.checkIn) {
        this.checkOut = addDays(this.checkIn, 1);
      }
      this.render();
    }
    setDates(checkIn, checkOut) {
      this.checkIn = checkIn;
      this.checkOut = checkOut;
      if (checkIn) {
        const d = parseDate(checkIn);
        this.currentYear = d.getUTCFullYear();
        this.currentMonth = d.getUTCMonth();
      }
      this.render();
    }
    canGoPrev() {
      if (this.currentYear < this.minYear) return false;
      if (this.currentYear === this.minYear && this.currentMonth <= this.minMonth) return false;
      return true;
    }
    prevMonth() {
      if (!this.canGoPrev()) return;
      this.currentMonth--;
      if (this.currentMonth < 0) {
        this.currentMonth = 11;
        this.currentYear--;
      }
      this.render();
    }
    nextMonth() {
      this.currentMonth++;
      if (this.currentMonth > 11) {
        this.currentMonth = 0;
        this.currentYear++;
      }
      this.render();
    }
    handleDayClick(dateStr) {
      if (dateStr < this.today) return;
      if (this.mode === 'single') {
        if (this.blockedDates.has(dateStr)) {
          this.onError('The selected date is blocked and not available.');
          return;
        }
        this.checkIn = dateStr;
        this.checkOut = addDays(dateStr, 1);
        this.onError('');
        this.render();
        this.onSelect({ checkIn: this.checkIn, checkOut: this.checkOut });
        return;
      }
      if (!this.checkIn || (this.checkIn && this.checkOut)) {
        if (this.blockedDates.has(dateStr)) {
          this.onError('A blocked date cannot be selected as check-in.');
          return;
        }
        this.checkIn = dateStr;
        this.checkOut = null;
        this.onError('');
        this.render();
        return;
      }
      if (dateStr <= this.checkIn) {
        if (this.blockedDates.has(dateStr)) {
          this.onError('A blocked date cannot be selected as check-in.');
          return;
        }
        this.checkIn = dateStr;
        this.checkOut = null;
        this.onError('');
        this.render();
        return;
      }
      const start = parseDate(this.checkIn);
      const end = parseDate(dateStr);
      const curr = new Date(start);
      let hasBlockedNight = false;
      while (curr < end) {
        const nightStr = formatDate(curr);
        if (this.blockedDates.has(nightStr)) {
          hasBlockedNight = true;
          break;
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
      if (hasBlockedNight) {
        this.onError('Your stay range includes an unavailable night. Please choose free dates.');
        return;
      }
      this.checkOut = dateStr;
      this.onError('');
      this.render();
      this.onSelect({ checkIn: this.checkIn, checkOut: this.checkOut });
    }
    render() {
      this.container.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'calendar-component';
      const navHeader = document.createElement('div');
      navHeader.className = 'calendar-nav';
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'btn btn-secondary btn-sm calendar-nav-btn';
      prevBtn.innerHTML = '&larr; Previous';
      prevBtn.disabled = !this.canGoPrev();
      prevBtn.setAttribute('aria-label', 'Previous month');
      prevBtn.addEventListener('click', () => this.prevMonth());
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'btn btn-secondary btn-sm calendar-nav-btn';
      nextBtn.innerHTML = 'Next &rarr;';
      nextBtn.setAttribute('aria-label', 'Next month');
      nextBtn.addEventListener('click', () => this.nextMonth());
      navHeader.appendChild(prevBtn);
      navHeader.appendChild(nextBtn);
      wrapper.appendChild(navHeader);
      const monthsGrid = document.createElement('div');
      monthsGrid.className = 'calendar-months-grid';
      monthsGrid.appendChild(this.buildMonthDOM(this.currentYear, this.currentMonth));
      let m2Year = this.currentYear;
      let m2Month = this.currentMonth + 1;
      if (m2Month > 11) {
        m2Month = 0;
        m2Year++;
      }
      monthsGrid.appendChild(this.buildMonthDOM(m2Year, m2Month));
      wrapper.appendChild(monthsGrid);
      const legend = document.createElement('div');
      legend.className = 'calendar-legend';
      legend.innerHTML = `
        <div class="legend-item"><span class="legend-dot legend-dot--available"></span> Available</div>
        <div class="legend-item"><span class="legend-dot legend-dot--blocked"></span> Unavailable</div>
        <div class="legend-item"><span class="legend-dot legend-dot--selected"></span> Selected</div>
      `;
      wrapper.appendChild(legend);
      this.container.appendChild(wrapper);
    }
    buildMonthDOM(year, month) {
      const monthCard = document.createElement('div');
      monthCard.className = 'calendar-month';
      monthCard.setAttribute('role', 'grid');
      monthCard.setAttribute('aria-label', `${MONTH_NAMES[month]} ${year}`);
      const title = document.createElement('div');
      title.className = 'calendar-month-title';
      title.textContent = `${MONTH_NAMES[month]} ${year}`;
      monthCard.appendChild(title);
      const table = document.createElement('div');
      table.className = 'calendar-grid';
      WEEKDAYS.forEach((w) => {
        const h = document.createElement('div');
        h.className = 'calendar-weekday';
        h.setAttribute('role', 'columnheader');
        h.textContent = w;
        table.appendChild(h);
      });
      const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day calendar-day--empty';
        empty.setAttribute('role', 'gridcell');
        empty.setAttribute('aria-hidden', 'true');
        table.appendChild(empty);
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isPast = dateStr < this.today;
        const isBlocked = this.blockedDates.has(dateStr);
        const isCheckIn = this.checkIn === dateStr;
        const isCheckOut = this.checkOut === dateStr;
        const isInRange = this.checkIn && this.checkOut && dateStr > this.checkIn && dateStr < this.checkOut;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'calendar-day';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('data-date', dateStr);
        cell.textContent = String(day);
        let cellLabel = `${day} ${MONTH_NAMES[month]} ${year}`;
        if (isPast) {
          cell.disabled = true;
          cell.classList.add('calendar-day--past');
          cellLabel += ', past date';
        } else if (isBlocked) {
          cell.classList.add('calendar-day--blocked');
          cellLabel += ', unavailable';
          if (!this.checkIn || (this.checkIn && this.checkOut)) {
            cell.disabled = true;
          }
        }
        if (isCheckIn) {
          cell.classList.add('calendar-day--selected', 'calendar-day--checkin');
          cellLabel += ', selected check-in';
        }
        if (isCheckOut) {
          cell.classList.add('calendar-day--selected', 'calendar-day--checkout');
          cellLabel += ', selected check-out';
        }
        if (isInRange) {
          cell.classList.add('calendar-day--in-range');
          cellLabel += ', included in stay';
        }
        cell.setAttribute('aria-label', cellLabel);
        if (!isPast) {
          cell.addEventListener('click', () => this.handleDayClick(dateStr));
          cell.addEventListener('mouseenter', () => {
            if (this.checkIn && !this.checkOut && dateStr > this.checkIn) {
              this.previewRange(this.checkIn, dateStr);
            }
          });
        }
        table.appendChild(cell);
      }
      monthCard.appendChild(table);
      return monthCard;
    }
    previewRange(startStr, hoverStr) {
      const allDays = this.container.querySelectorAll('.calendar-day[data-date]');
      allDays.forEach((el) => {
        const d = el.getAttribute('data-date');
        if (d > startStr && d <= hoverStr) {
          el.classList.add('calendar-day--hover-range');
        } else {
          el.classList.remove('calendar-day--hover-range');
        }
      });
    }
  }
  window.NSG.Calendar = Calendar;
})();
