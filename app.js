// ==========================================
// EVENTS CALENDAR 2026 - Main Application
// ==========================================

const SHEET_ID = '1Nljo5hYJ4mXaSDVr_2JTPA8JuvgOO22visf6CjqOkgE';
const SHEET_NAME = 'Events 2026';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const YEAR = 2026;

let events = [];
let currentMonth = new Date().getMonth(); // 0-indexed
let currentView = 'monthly';
let currentFilter = 'all';
let refreshTimer = null;

// ==========================================
// DATA FETCHING
// ==========================================

async function fetchEvents() {
  const loading = document.getElementById('loading');
  const errorState = document.getElementById('errorState');
  const refreshBtn = document.getElementById('refreshBtn');

  loading.style.display = 'flex';
  errorState.style.display = 'none';
  refreshBtn.classList.add('spinning');

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    events = parseCSV(csv);
    onEventsLoaded('Google Sheets');
  } catch (err) {
    console.warn('Google Sheets fetch failed, trying fallback JSON...', err.message);
    try {
      const fallbackResp = await fetch('fallback-data.json');
      if (!fallbackResp.ok) throw new Error('Fallback also failed');
      const fallbackData = await fallbackResp.json();
      events = fallbackData.map(obj => normalizeEvent({
        '#': obj.id,
        event_name: obj.name,
        start_date: obj.startDate,
        end_date: obj.endDate,
        city: obj.city,
        country: obj.country,
        type: obj.type,
        notes: obj.notes
      })).filter(Boolean).sort((a, b) => a.startDate - b.startDate);
      onEventsLoaded('local file (Google Sheet not public)');
    } catch (fallbackErr) {
      loading.style.display = 'none';
      errorState.style.display = 'flex';
      document.getElementById('errorMessage').textContent =
        `Failed to load events: ${err.message}. Make sure the Google Sheet is shared publicly (Anyone with the link → Viewer).`;
      console.error('Fetch error:', err);
    }
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

function onEventsLoaded(source) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('errorState').style.display = 'none';
  document.getElementById('lastUpdated').textContent = `${new Date().toLocaleTimeString()} (${source})`;
  document.getElementById('totalEvents').textContent = events.length;
  renderCurrentView();
  updateMonthChips();
}

function parseCSV(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_')] = (values[idx] || '').replace(/^"|"$/g, '').trim();
    });

    // Skip rows without event name or dates
    if (!obj.event_name && !obj['event_name']) continue;

    const event = normalizeEvent(obj);
    if (event) result.push(event);
  }

  return result.sort((a, b) => a.startDate - b.startDate);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function normalizeEvent(obj) {
  // Find the right keys (handles variations in header naming)
  const name = obj.event_name || obj['event_name'] || '';
  const startStr = obj.start_date || obj['start_date'] || '';
  const endStr = obj.end_date || obj['end_date'] || '';
  const city = obj.city || '';
  const country = obj.country || '';
  const type = obj.type || '';
  const notes = obj.notes || '';
  const num = obj['#'] || '';

  if (!name || !startStr) return null;

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr) || startDate;

  if (!startDate) return null;

  const typeNormalized = normalizeType(type);

  return {
    id: num || Math.random().toString(36).substr(2, 9),
    name,
    startDate,
    endDate,
    city,
    country,
    type: typeNormalized,
    notes,
    isMultiDay: endDate > startDate
  };
}

function parseDate(str) {
  if (!str) return null;
  // Handle various date formats: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD
  const parts = str.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeType(type) {
  const t = type.toLowerCase().trim();
  if (t.includes('rofintech')) return 'rofintech';
  if (t.includes('finqware')) return 'finqware';
  if (t.includes('personal')) return 'personal';
  return 'finqware'; // default
}

// ==========================================
// VIEW SWITCHING
// ==========================================

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('monthlyView').style.display = view === 'monthly' ? 'block' : 'none';
  document.getElementById('yearlyView').style.display = view === 'yearly' ? 'block' : 'none';
  document.getElementById('listView').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('monthNav').style.display = view === 'monthly' ? 'flex' : 'none';
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === 'monthly') renderMonthlyView();
  else if (currentView === 'yearly') renderYearlyView();
  else if (currentView === 'list') renderListView();
}

// ==========================================
// MONTHLY VIEW
// ==========================================

function renderMonthlyView() {
  const grid = document.getElementById('calendarGrid');
  const month = currentMonth;
  const year = YEAR;

  document.getElementById('currentMonthLabel').textContent = `${MONTHS[month]} ${year}`;

  // Update month chips
  document.querySelectorAll('.month-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.month) === month);
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Get events for this month
  const monthEvents = getEventsForMonth(month, year);

  let html = `
    <div class="day-header">
      ${DAYS.map(d => `<span>${d}</span>`).join('')}
    </div>
    <div class="days">
  `;

  // Empty cells before first day
  for (let i = 0; i < startDow; i++) {
    html += `<div class="day-cell empty"></div>`;
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dow = (date.getDay() + 6) % 7;
    const isWeekend = dow >= 5;
    const isToday = isCurrentMonth && today.getDate() === day;
    const dayEvents = getEventsForDate(date, monthEvents);

    let classes = 'day-cell';
    if (isWeekend) classes += ' weekend';
    if (isToday) classes += ' today';

    html += `<div class="${classes}">`;
    html += `<div class="day-number">${isToday ? `<span>${day}</span>` : day}</div>`;

    const maxShow = 3;
    dayEvents.slice(0, maxShow).forEach(ev => {
      const typeClass = ev.type;
      const shortName = ev.name.substring(0, 35);
      html += `<div class="event-chip ${typeClass}${ev.isMultiDay ? ' multi-day' : ''}"
                    onclick="openModal(${events.indexOf(ev)})"
                    title="${escapeHtml(ev.name)}">${shortName}</div>`;
    });

    if (dayEvents.length > maxShow) {
      html += `<div class="more-events" onclick="showDayEvents(${year}, ${month}, ${day})">+${dayEvents.length - maxShow} more</div>`;
    }

    html += `</div>`;
  }

  // Empty cells after last day
  const totalCells = startDow + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    html += `<div class="day-cell empty"></div>`;
  }

  html += `</div>`;
  grid.innerHTML = html;
}

function getEventsForMonth(month, year) {
  return events.filter(ev => {
    const startMonth = ev.startDate.getMonth();
    const startYear = ev.startDate.getFullYear();
    const endMonth = ev.endDate.getMonth();
    const endYear = ev.endDate.getFullYear();

    return (startYear === year && startMonth === month) ||
           (endYear === year && endMonth === month) ||
           (ev.startDate <= new Date(year, month + 1, 0) && ev.endDate >= new Date(year, month, 1));
  });
}

function getEventsForDate(date, monthEvents) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return (monthEvents || events).filter(ev => {
    const start = new Date(ev.startDate.getFullYear(), ev.startDate.getMonth(), ev.startDate.getDate());
    const end = new Date(ev.endDate.getFullYear(), ev.endDate.getMonth(), ev.endDate.getDate());
    return d >= start && d <= end;
  });
}

// ==========================================
// YEARLY VIEW
// ==========================================

function renderYearlyView() {
  const grid = document.getElementById('yearlyGrid');
  let html = '';

  for (let month = 0; month < 12; month++) {
    const monthEvents = getEventsForMonth(month, YEAR);
    const firstDay = new Date(YEAR, month, 1);
    const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
    const startDow = (firstDay.getDay() + 6) % 7;

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === YEAR && today.getMonth() === month;

    html += `<div class="mini-month">
      <div class="mini-month-header" onclick="goToMonth(${month})">
        ${MONTHS[month]}
        ${monthEvents.length > 0 ? `<span class="event-count">${monthEvents.length} event${monthEvents.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="mini-days-header">
        ${DAYS.map(d => `<span>${d[0]}</span>`).join('')}
      </div>
      <div class="mini-days">`;

    // Empty cells
    for (let i = 0; i < startDow; i++) {
      html += `<div class="mini-day"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(YEAR, month, day);
      const dow = (date.getDay() + 6) % 7;
      const isWeekend = dow >= 5;
      const isToday = isCurrentMonth && today.getDate() === day;
      const dayEvents = getEventsForDate(date, monthEvents);

      let classes = 'mini-day';
      if (isWeekend) classes += ' weekend';
      if (isToday) classes += ' today';
      if (dayEvents.length > 0) {
        classes += ' has-event';
        if (dayEvents.length > 1) {
          const types = [...new Set(dayEvents.map(e => e.type))];
          classes += types.length > 1 ? ' multi' : ` ${types[0]}`;
        } else {
          classes += ` ${dayEvents[0].type}`;
        }
      }

      const tooltip = dayEvents.length > 0
        ? dayEvents.map(e => e.name.substring(0, 40)).join(' | ')
        : '';

      html += `<div class="${classes}"
        ${dayEvents.length > 0 ? `onclick="goToMonth(${month})"` : ''}>
        ${day}
        ${tooltip ? `<div class="mini-day-tooltip">${escapeHtml(tooltip)}</div>` : ''}
      </div>`;
    }

    html += `</div></div>`;
  }

  grid.innerHTML = html;
}

function goToMonth(month) {
  currentMonth = month;
  switchView('monthly');
}

// ==========================================
// LIST VIEW
// ==========================================

function renderListView() {
  const list = document.getElementById('eventsList');
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();

  let filtered = events.filter(ev => {
    if (currentFilter !== 'all' && ev.type.toLowerCase() !== currentFilter.toLowerCase()) return false;
    if (searchTerm && !ev.name.toLowerCase().includes(searchTerm) &&
        !ev.city.toLowerCase().includes(searchTerm) &&
        !ev.country.toLowerCase().includes(searchTerm)) return false;
    return true;
  });

  // Apply country filter
  const activeCountryChip = document.querySelector('#countryFilter .filter-chip.active');
  if (activeCountryChip && activeCountryChip.dataset.filter !== 'all-countries') {
    filtered = filtered.filter(ev => ev.country === activeCountryChip.dataset.filter);
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div class="no-results">
      <span class="material-icons-outlined">event_busy</span>
      No events found matching your filters.
    </div>`;
    return;
  }

  // Group by month
  const grouped = {};
  filtered.forEach(ev => {
    const monthKey = ev.startDate.getMonth();
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(ev);
  });

  let html = '';
  Object.keys(grouped).sort((a, b) => a - b).forEach(monthKey => {
    const monthEvents = grouped[monthKey];
    html += `<div class="list-month-header">
      ${MONTHS[monthKey]}
      <span class="month-event-count">${monthEvents.length} event${monthEvents.length > 1 ? 's' : ''}</span>
    </div>`;

    monthEvents.forEach(ev => {
      const startDay = ev.startDate.getDate();
      const weekday = ev.startDate.toLocaleDateString('en-US', { weekday: 'short' });
      const dateRange = ev.isMultiDay
        ? `${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}`
        : formatDate(ev.startDate);

      html += `<div class="event-row" onclick="openModal(${events.indexOf(ev)})">
        <div class="event-date-block">
          <div class="day">${startDay}</div>
          <div class="weekday">${weekday}</div>
        </div>
        <div class="event-color-bar ${ev.type}"></div>
        <div class="event-info">
          <div class="event-name">${escapeHtml(ev.name)}</div>
          <div class="event-meta">
            <span class="material-icons-outlined">location_on</span>
            ${escapeHtml(ev.city)}${ev.country ? `, ${escapeHtml(ev.country)}` : ''}
            ${ev.isMultiDay ? `<span>|</span><span class="material-icons-outlined">date_range</span>${dateRange}` : ''}
          </div>
        </div>
        <div class="event-type-pill ${ev.type}">${capitalize(ev.type)}</div>
      </div>`;
    });
  });

  list.innerHTML = html;
  updateCountryFilter();
}

function updateCountryFilter() {
  const container = document.getElementById('countryFilter');
  const countries = [...new Set(events.map(e => e.country).filter(Boolean))].sort();

  if (container.children.length > 0) return; // Already rendered

  let html = `<button class="filter-chip active" data-filter="all-countries" onclick="filterByCountry(this)">All Countries</button>`;
  countries.forEach(c => {
    html += `<button class="filter-chip" data-filter="${escapeHtml(c)}" onclick="filterByCountry(this)">${escapeHtml(c)}</button>`;
  });
  container.innerHTML = html;
}

function filterByCountry(chip) {
  document.querySelectorAll('#countryFilter .filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  renderListView();
}

// ==========================================
// MODAL
// ==========================================

function openModal(index) {
  const ev = events[index];
  if (!ev) return;

  const overlay = document.getElementById('modalOverlay');
  const header = document.getElementById('modalHeader');
  const badge = document.getElementById('modalBadge');
  const title = document.getElementById('modalTitle');
  const dateEl = document.getElementById('modalDate');
  const locationEl = document.getElementById('modalLocation');
  const typeEl = document.getElementById('modalType');
  const notesEl = document.getElementById('modalNotes');
  const notesContainer = document.getElementById('modalNotesContainer');

  header.className = `modal-header ${ev.type}`;
  badge.className = `modal-type-badge ${ev.type}`;
  badge.textContent = capitalize(ev.type);
  title.textContent = ev.name;

  const dateStr = ev.isMultiDay
    ? `${formatDateLong(ev.startDate)} - ${formatDateLong(ev.endDate)}`
    : formatDateLong(ev.startDate);
  dateEl.textContent = dateStr;

  locationEl.textContent = `${ev.city}${ev.country ? `, ${ev.country}` : ''}`;
  typeEl.textContent = capitalize(ev.type);

  if (ev.notes) {
    notesContainer.style.display = 'flex';
    notesEl.textContent = ev.notes;
  } else {
    notesContainer.style.display = 'none';
  }

  // Check for links in notes
  const linksContainer = document.getElementById('modalLinks');
  const linksContent = document.getElementById('modalLinksContent');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = (ev.notes || '').match(urlRegex);

  if (urls && urls.length > 0) {
    linksContainer.style.display = 'block';
    linksContent.innerHTML = urls.map(url =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <span class="material-icons-outlined">open_in_new</span>
        ${escapeHtml(url.replace(/https?:\/\//, '').substring(0, 40))}...
      </a><br>`
    ).join('');
  } else {
    linksContainer.style.display = 'none';
  }

  // Details section
  const detailsContent = document.getElementById('modalDetailsContent');
  const daysUntil = Math.ceil((ev.startDate - new Date()) / (1000 * 60 * 60 * 24));
  let detailsHtml = '';

  if (daysUntil > 0) {
    detailsHtml += `<p><strong>${daysUntil} day${daysUntil !== 1 ? 's' : ''}</strong> from today</p>`;
  } else if (daysUntil === 0) {
    detailsHtml += `<p><strong>Happening today!</strong></p>`;
  } else {
    detailsHtml += `<p>${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago</p>`;
  }

  if (ev.isMultiDay) {
    const duration = Math.ceil((ev.endDate - ev.startDate) / (1000 * 60 * 60 * 24)) + 1;
    detailsHtml += `<p>Duration: <strong>${duration} day${duration !== 1 ? 's' : ''}</strong></p>`;
  }

  if (ev.country && ev.country !== 'Romania') {
    detailsHtml += `<p>International event in <strong>${escapeHtml(ev.country)}</strong></p>`;
  }

  if (ev.notes) {
    detailsHtml += `<p><strong>Notes:</strong> ${escapeHtml(ev.notes)}</p>`;
  }

  detailsContent.innerHTML = detailsHtml || '<p class="placeholder-text">No additional details yet.</p>';

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ==========================================
// MONTH NAVIGATION
// ==========================================

function updateMonthChips() {
  const container = document.getElementById('monthChips');
  let html = '';
  MONTHS.forEach((m, i) => {
    const hasEvents = getEventsForMonth(i, YEAR).length > 0;
    html += `<button class="month-chip${i === currentMonth ? ' active' : ''}${hasEvents ? ' has-events' : ''}"
              data-month="${i}" onclick="navigateToMonth(${i})">${m.substring(0, 3)}</button>`;
  });
  container.innerHTML = html;
}

function navigateToMonth(month) {
  currentMonth = month;
  renderMonthlyView();
  updateMonthChips();
}

// ==========================================
// UTILITIES
// ==========================================

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showDayEvents(year, month, day) {
  const date = new Date(year, month, day);
  const dayEvents = getEventsForDate(date);
  if (dayEvents.length === 1) {
    openModal(events.indexOf(dayEvents[0]));
  }
  // If multiple, just open the first for now
  if (dayEvents.length > 0) {
    openModal(events.indexOf(dayEvents[0]));
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // View switching
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Month navigation
  document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth = (currentMonth - 1 + 12) % 12;
    renderMonthlyView();
    updateMonthChips();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth = (currentMonth + 1) % 12;
    renderMonthlyView();
    updateMonthChips();
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', fetchEvents);

  // List filters
  document.querySelectorAll('#filterChips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderListView();
    });
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', () => {
    renderListView();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (currentView === 'monthly' && !document.getElementById('modalOverlay').classList.contains('active')) {
      if (e.key === 'ArrowLeft') {
        currentMonth = (currentMonth - 1 + 12) % 12;
        renderMonthlyView();
        updateMonthChips();
      } else if (e.key === 'ArrowRight') {
        currentMonth = (currentMonth + 1) % 12;
        renderMonthlyView();
        updateMonthChips();
      }
    }
  });

  // Initial load
  fetchEvents();

  // Auto-refresh
  refreshTimer = setInterval(fetchEvents, REFRESH_INTERVAL);
});
