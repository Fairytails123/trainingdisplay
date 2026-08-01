/* ============================================
   display.js — TV Display (read-only dashboard)
   Dog-centric layout: each row = one dog
   Shows bookings across the next 14 days
   Fetches from Google Sheets API, refreshes every 30s
   ============================================ */

(function () {
  'use strict';

  var REFRESH_INTERVAL = 30000; // 30 seconds
  var CLOCK_INTERVAL = 1000;    // 1 second
  var API_URL = 'https://script.google.com/macros/s/AKfycbzBzTZKpAHKidIsa653UWCo-TbUOgxCTbqyE69obmV2rij_0cJsnSsciOcZci564RrR/exec';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // In-memory data cache (populated from Sheets API)
  var cachedData = {
    dogs: [],
    slotsByDate: {},
    timeSlots: [],
    equipment: [],
    // Missed-report tracker. reports: {dogId: ['YYYY-MM-DD', ...]} of SUBMITTED
    // report dates, or null = data unavailable (fetch failed / backend not
    // serving it) — the tracker then renders NOTHING rather than fake "missed".
    // dismissed: same shape, manual removals from the Report_Dismissals tab.
    reports: null,
    dismissed: {}
  };
  var lastFetchTime = null;
  var fetchFailed = false;
  // Optimistic local dismissals ("dogId|date" -> epoch ms) so a remote-press
  // delete hides the chip instantly; entries expire after 10 min, by which
  // time the server copy has taken over (or the POST was lost and the chip
  // honestly reappears).
  var localDismissed = {};
  var LOCAL_DISMISS_TTL_MS = 10 * 60 * 1000;

  // ---- HTML escaping (XSS prevention) ----

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ---- Data fetching ----

  function fetchFromSheets(onComplete, isRetry) {
    var footer = document.getElementById('last-updated');
    if (footer) footer.textContent = 'Syncing...';

    // Append a timestamp so neither browser nor any intermediary serves a cached response.
    fetch(API_URL + '?action=getAll&_t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          cachedData.dogs = data.dogs || [];
          cachedData.slotsByDate = data.slotsByDate || {};
          cachedData.timeSlots = (data.timeSlots && data.timeSlots.length > 0) ? data.timeSlots : getDefaultTimeSlots();
          cachedData.equipment = data.equipment || [];
          // null = unavailable this cycle (absent or ok:false) — never fake "missed".
          cachedData.reports = (data.reports && data.reports.ok === true) ? (data.reports.dates || {}) : null;
          cachedData.dismissed = (data.reports && data.reports.dismissed) || {};
          lastFetchTime = new Date();
          fetchFailed = false;
          if (onComplete) onComplete(true);
          return;
        }
        console.warn('Sheets API returned failure:', data.error || '(no error message)');
        handleFetchFailure(onComplete, isRetry);
      })
      .catch(function (err) {
        console.warn('Fetch failed:', err.message);
        handleFetchFailure(onComplete, isRetry);
      });
  }

  // On the first failure within a polling cycle, retry once after a short delay
  // before falling back to the 30s interval — keeps the screen in sync through brief blips.
  function handleFetchFailure(onComplete, isRetry) {
    fetchFailed = true;
    if (isRetry) {
      if (onComplete) onComplete(false);
      return;
    }
    setTimeout(function () {
      fetchFromSheets(onComplete, true);
    }, 5000);
  }

  function getDefaultTimeSlots() {
    return [
      { id: 'am_early', label: '08:00 – 09:00', shortLabel: '08–09', period: 'am' },
      { id: 'am_mid',   label: '09:00 – 10:00', shortLabel: '09–10', period: 'am' },
      { id: 'am_late',  label: '10:00 – 11:00', shortLabel: '10–11', period: 'am' },
      { id: 'midday',   label: '11:00 – 12:00', shortLabel: '11–12', period: 'am' },
      { id: 'pm_early', label: '13:00 – 14:00', shortLabel: '13–14', period: 'pm' },
      { id: 'pm_mid',   label: '14:00 – 15:00', shortLabel: '14–15', period: 'pm' },
      { id: 'pm_late',  label: '15:00 – 16:00', shortLabel: '15–16', period: 'pm' },
      { id: 'pm_end',   label: '16:00 – 17:00', shortLabel: '16–17', period: 'pm' }
    ];
  }

  // ---- Data accessors (from cache) ----

  function getTimeSlots() {
    return cachedData.timeSlots.length > 0 ? cachedData.timeSlots : getDefaultTimeSlots();
  }

  function getEquipment() {
    return cachedData.equipment;
  }

  function getDogs() {
    return cachedData.dogs;
  }

  // ---- Date helpers ----

  function getTodayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function formatDateLong(date) {
    return DAYS_FULL[date.getDay()] + ' ' +
           date.getDate() + ' ' +
           MONTHS[date.getMonth()] + ' ' +
           date.getFullYear();
  }

  function formatTime(date) {
    return String(date.getHours()).padStart(2, '0') + ':' +
           String(date.getMinutes()).padStart(2, '0');
  }

  // Training dates arrive from the Sheet as 'YYYY-MM-DD' strings. Parse the
  // string directly (no Date object) so a value like '2025-01-12' never shifts
  // a day across the TV's timezone. Renders as '12 Jan 25'; '' for blanks.
  function formatDateShort(isoStr) {
    if (!isoStr) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoStr));
    if (!m) return '';
    var mon = MONTHS[parseInt(m[2], 10) - 1];
    if (!mon) return '';
    return parseInt(m[3], 10) + ' ' + mon + ' ' + m[1].slice(2);
  }

  // A break window: '12 Jan 25 to 16 Jan 25'. Degrades to a single date if only
  // one end is set, and to '' when neither is.
  function formatTrainingRange(startStr, endStr) {
    var s = formatDateShort(startStr);
    var e = formatDateShort(endStr);
    if (s && e) return s + ' to ' + e;
    return s || e || '';
  }

  // ---- Missed-report tracker (pure logic) ----
  //
  // A training report is required every Monday-Thursday for every active dog.
  // Today's date counts as missed from 17:00; a missed date auto-expires
  // after 14 days; a date inside a break window, after the training end date,
  // or before the dog was added is never required. Colour by age: 0 = today
  // (green), 1 = yesterday (amber), 2 = older (red).

  var REPORT_WINDOW_DAYS = 14;           // today .. today-13 inclusive
  var REPORT_TODAY_CUTOFF_MIN = 17 * 60; // today's chip appears at 17:00

  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // Add delta days (may be negative) to 'YYYY-MM-DD'. Numeric-component Date
  // construction (local), the getNext14Days pattern — NEVER new Date(isoString).
  // UK DST-safe: clocks change at 01:00 so local midnight always exists.
  function addDaysToDateStr(dateStr, delta) {
    var m = DATE_RE.exec(String(dateStr));
    if (!m) return '';
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + delta);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  // 0=Sun .. 6=Sat from 'YYYY-MM-DD'; -1 for invalid input.
  function dayOfWeekFromStr(dateStr) {
    var m = DATE_RE.exec(String(dateStr));
    if (!m) return -1;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getDay();
  }

  // '2026-07-31' -> '31 Jul' (no year — chips are always within 14 days).
  function formatDateChip(dateStr) {
    var m = DATE_RE.exec(String(dateStr));
    if (!m) return '';
    var mon = MONTHS[parseInt(m[2], 10) - 1];
    return mon ? (parseInt(m[3], 10) + ' ' + mon) : '';
  }

  // Break window, inclusive both ends; a lone start OR lone end acts as a
  // one-day window. 'YYYY-MM-DD' string comparison is chronological.
  function inBreakWindow(dateStr, startStr, endStr) {
    var s = DATE_RE.test(String(startStr || '')) ? startStr : '';
    var e = DATE_RE.test(String(endStr || '')) ? endStr : '';
    var lo = s || e;
    var hi = e || s;
    return !!lo && dateStr >= lo && dateStr <= hi;
  }

  // PURE — takes "now" as data, never reads the clock. nowParts = {todayStr,
  // minutes}. clearedDatesForDog = submitted report dates + dismissals merged
  // by the caller (a dismissed date behaves exactly like a submitted one).
  // Returns missed required days OLDEST FIRST: [{date:'YYYY-MM-DD', age:0|1|2}].
  function computeMissedReports(dog, clearedDatesForDog, nowParts) {
    var cleared = {};
    (clearedDatesForDog || []).forEach(function (r) {
      cleared[String(r).slice(0, 10)] = true;
    });

    // createdAt is an ISO UTC datetime; slice(0,10) is the UTC calendar date,
    // up to one day off London local for dogs created 23:00-01:00 UK.
    // Accepted: worst case the first required day of a brand-new dog shifts
    // by one, self-correcting at the first report. Malformed -> no lower bound.
    var createdStr = String((dog && dog.createdAt) || '').slice(0, 10);
    if (!DATE_RE.test(createdStr)) createdStr = '';
    var endStr = (dog && DATE_RE.test(String(dog.trainingEndDate || ''))) ? dog.trainingEndDate : '';

    var missed = [];
    for (var offset = REPORT_WINDOW_DAYS - 1; offset >= 0; offset--) {
      var d = addDaysToDateStr(nowParts.todayStr, -offset);
      if (!d) continue;
      var dow = dayOfWeekFromStr(d);
      if (dow < 1 || dow > 4) continue;                                    // Mon-Thu only
      if (offset === 0 && nowParts.minutes < REPORT_TODAY_CUTOFF_MIN) continue;
      if (createdStr && d < createdStr) continue;
      if (endStr && d > endStr) continue;
      if (dog && inBreakWindow(d, dog.break1Start, dog.break1End)) continue;
      if (dog && inBreakWindow(d, dog.break2Start, dog.break2End)) continue;
      if (cleared[d]) continue;
      missed.push({ date: d, age: offset >= 2 ? 2 : offset });
    }
    return missed;
  }

  // The single "now" seam. nowOverride enables DevTools/node time-travel via
  // the test hook (persists across polls until cleared); null = real clock.
  var nowOverride = null;
  function getNowParts() {
    if (nowOverride) return nowOverride;
    var d = new Date();
    return { todayStr: getTodayStr(), minutes: d.getHours() * 60 + d.getMinutes() };
  }

  // Submitted + server-dismissed + fresh local-dismissed dates for one dog.
  function getClearedDates(dogId) {
    var out = (cachedData.reports && cachedData.reports[dogId] || []).slice();
    out = out.concat(cachedData.dismissed[dogId] || []);
    var cutoff = Date.now() - LOCAL_DISMISS_TTL_MS;
    Object.keys(localDismissed).forEach(function (k) {
      if (localDismissed[k] < cutoff) { delete localDismissed[k]; return; }
      var sep = k.indexOf('|');
      if (k.slice(0, sep) === dogId) out.push(k.slice(sep + 1));
    });
    return out;
  }

  // ---- Missed-report tracker (remote-control delete) ----
  //
  // Chips are real <button>s so they work on every TV-browser input model:
  // virtual-cursor remotes and air-mice click them directly; D-pad browsers
  // get the arrow-key navigation below. Single press deletes (owner choice);
  // the toast + the Report_Dismissals audit row make an accidental press
  // visible and reversible (delete the Sheet row to un-dismiss).

  function closestChip(el) {
    while (el && el.nodeType === 1) {
      if (el.classList && el.classList.contains('report-chip')) return el;
      el = el.parentNode;
    }
    return null;
  }

  var toastTimer = null;
  function showDismissToast(text) {
    var el = document.getElementById('dismiss-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('dismiss-toast--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('dismiss-toast--visible');
    }, 4000);
  }

  function dismissChip(dogId, date) {
    if (!dogId || !date) return;
    localDismissed[dogId + '|' + date] = Date.now();

    // Fire-and-forget, CORS-simple (no JSON content-type: an Apps Script
    // preflight would 405 and the POST would never leave the browser).
    try {
      fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'dismissReportDate', data: { dogId: dogId, date: date } })
      });
    } catch (e) {
      console.warn('dismissReportDate POST failed:', e && e.message);
    }

    var dog = cachedData.dogs.find(function (d) { return d.id === dogId; });
    showDismissToast('Removed ' + (formatDateChip(date) || date) +
                     (dog ? ' — ' + dog.name : ''));

    renderSchedule();
    fitToScreen();
    updateFooter();
  }

  // D-pad navigation for TV browsers that deliver raw arrow-key events:
  // arrows move focus across the visible chips, OK/Enter deletes the focused
  // one, Back/Escape drops focus. Keys are never stolen when no chip exists.
  var autoBlurTimer = null;
  function armChipAutoBlur() {
    if (autoBlurTimer) clearTimeout(autoBlurTimer);
    autoBlurTimer = setTimeout(function () {
      var el = document.activeElement;
      if (closestChip(el)) el.blur();
    }, 20000); // a chip left focused for hours must not turn a stray OK into a delete
  }

  function handleChipKeydown(e) {
    var key = e.key;
    var active = closestChip(document.activeElement);

    if (key === 'Escape' || key === 'Backspace') {
      if (active) { active.blur(); e.preventDefault(); }
      return;
    }
    if (key === 'Enter' || key === ' ') {
      if (active) {
        e.preventDefault(); // explicit click; preventDefault stops a second, synthesised one
        active.click();
      }
      return;
    }
    var isArrow = key === 'ArrowLeft' || key === 'ArrowRight' ||
                  key === 'ArrowUp' || key === 'ArrowDown';
    if (!isArrow) return;

    var chips = Array.prototype.slice.call(document.querySelectorAll('.report-chip'));
    if (chips.length === 0) return;

    var idx = chips.indexOf(active);
    var next;
    if (idx === -1) {
      next = 0;
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
      next = Math.min(idx + 1, chips.length - 1);
    } else {
      next = Math.max(idx - 1, 0);
    }
    chips[next].focus();
    e.preventDefault();
    armChipAutoBlur();
  }

  // ---- 14-day schedule builder ----

  function getNext14Days() {
    var dates = [];
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    for (var i = 0; i < 14; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      dates.push({
        dateStr: d.getFullYear() + '-' + mm + '-' + dd,
        dateObj: d
      });
    }
    return dates;
  }

  function formatSlotCard(dateObj, slotId) {
    var timeSlots = getTimeSlots();
    var slot = timeSlots.find(function (s) { return s.id === slotId; });
    var timeLabel = slot ? slot.shortLabel : slotId;
    var dayName = DAYS_SHORT[dateObj.getDay()];
    var dayNum = dateObj.getDate();
    var isToday = dateObj.toDateString() === new Date().toDateString();
    var period = slot ? slot.period : 'am';
    return {
      dayLabel: dayName + ' ' + dayNum,
      timeLabel: timeLabel,
      isToday: isToday,
      period: period
    };
  }

  function buildDogSchedules() {
    var dogs = getDogs().filter(function (d) { return !d.archived; });
    var dates = getNext14Days();

    return dogs.map(function (dog) {
      var slots = [];
      dates.forEach(function (dateInfo) {
        var dayAssignments = cachedData.slotsByDate[dateInfo.dateStr];
        if (dayAssignments && dayAssignments[dog.id]) {
          var assignment = dayAssignments[dog.id];
          var cardInfo = formatSlotCard(dateInfo.dateObj, assignment.slotId);
          slots.push({
            date: dateInfo.dateStr,
            slotId: assignment.slotId,
            dayLabel: cardInfo.dayLabel,
            timeLabel: cardInfo.timeLabel,
            isToday: cardInfo.isToday,
            period: cardInfo.period
          });
        }
      });
      return {
        dog: dog,
        slots: slots,
        notes: dog.notes || ''
      };
    }).sort(function (a, b) {
      return a.dog.name.localeCompare(b.dog.name, 'en-GB', { sensitivity: 'base' });
    });
  }

  // ---- Render ----

  function renderSchedule() {
    var content = document.getElementById('schedule-content');
    if (!content) return;
    var equipment = getEquipment();
    var dogs = getDogs().filter(function (d) { return !d.archived; });

    if (dogs.length === 0) {
      content.innerHTML =
        '<div class="no-data">' +
          '<div class="no-data__icon">&#128054;</div>' +
          '<div class="no-data__title">No training schedule</div>' +
          '<div class="no-data__text">' +
            escapeHtml(fetchFailed ? 'Could not connect to Google Sheets. Retrying...' : 'No dogs found. Add dogs in the Training Planner.') +
          '</div>' +
        '</div>';
      document.getElementById('conflict-count').textContent = '';
      return;
    }

    var schedules = buildDogSchedules();
    var html = '';

    // Count conflicts: multiple dogs in the same slot on the same date
    var conflictMap = {};
    schedules.forEach(function (entry) {
      entry.slots.forEach(function (s) {
        var key = s.date + '|' + s.slotId;
        conflictMap[key] = (conflictMap[key] || 0) + 1;
      });
    });

    var totalConflicts = 0;
    Object.keys(conflictMap).forEach(function (key) {
      if (conflictMap[key] > 1) totalConflicts++;
    });

    // Missed-report tracker inputs, resolved once per render. reports === null
    // means the data is unavailable this cycle — render no chips (never fake
    // "missed"); the footer carries a muted note instead. The clock is read
    // fresh here so chips appear/age within one 30s poll of 17:00 / midnight.
    var reportsAvailable = cachedData.reports !== null;
    var nowParts = reportsAvailable ? getNowParts() : null;

    // Render each dog as a row
    schedules.forEach(function (entry) {
      var dog = entry.dog;
      var slots = entry.slots;
      var notes = entry.notes;
      var hasSlots = slots.length > 0;
      var hasNotes = notes.length > 0;

      // Training end date + break windows (right-aligned column, built below)
      var endStr = formatDateShort(dog.trainingEndDate);
      var break1 = formatTrainingRange(dog.break1Start, dog.break1End);
      var break2 = formatTrainingRange(dog.break2Start, dog.break2End);
      var hasDates = !!(endStr || break1 || break2);

      var missed = reportsAvailable
        ? computeMissedReports(dog, getClearedDates(dog.id), nowParts)
        : [];
      var hasMissed = missed.length > 0;

      // A dog whose only content is missed-report chips must NOT be dimmed.
      var isEmpty = !hasSlots && !hasNotes && !hasDates && !hasMissed;

      html += '<div class="dog-row' + (isEmpty ? ' dog-row--empty' : '') + '">';

      // Left column: dog info
      html += '<div class="dog-row__info">';
      html += '<div class="dog-row__name">' + escapeHtml(dog.name) + '</div>';
      if (dog.breed) {
        html += '<div class="dog-row__breed">' + escapeHtml(dog.breed) + '</div>';
      }
      if (dog.weekNumber != null && dog.weekNumber !== '') {
        html += '<div class="dog-row__week">Wk ' + escapeHtml(String(dog.weekNumber)) + '</div>';
      }
      if (dog.equipment && dog.equipment.length > 0) {
        html += '<div class="dog-row__equipment">';
        dog.equipment.forEach(function (eqId) {
          var eq = equipment.find(function (e) { return e.id === eqId; });
          if (eq) {
            html += '<span class="equip-tag" style="background:' + escapeHtml(eq.colour) +
                    ';color:' + escapeHtml(eq.textColour) + ';">' + escapeHtml(eq.label) + '</span>';
          }
        });
        html += '</div>';
      }
      html += '</div>';

      // Content area: slots + notes
      html += '<div class="dog-row__content">';

      // Slot cards
      if (hasSlots) {
        html += '<div class="dog-row__slots">';
        slots.forEach(function (s) {
          var conflictKey = s.date + '|' + s.slotId;
          var isConflict = conflictMap[conflictKey] > 1;
          html += '<div class="slot-card slot-card--' + escapeHtml(s.period) +
                  (s.isToday ? ' slot-card--today' : '') +
                  (isConflict ? ' slot-card--conflict' : '') + '">';
          html += '<span class="slot-card__day">' + escapeHtml(s.dayLabel) + '</span>';
          html += '<span class="slot-card__time">' + escapeHtml(s.timeLabel) + '</span>';
          if (isConflict) {
            html += '<span class="slot-card__conflict">!</span>';
          }
          html += '</div>';
        });
        html += '</div>';
      }

      // Notes
      if (hasNotes) {
        html += '<div class="dog-row__notes' + (!hasSlots ? ' dog-row__notes--full' : '') + '">';
        html += '<div class="dog-row__notes-text">' + escapeHtml(notes) + '</div>';
        html += '</div>';
      }

      html += '</div>'; // .dog-row__content

      // Right-aligned training dates column. Hard product requirement: anything
      // about the training end date or break windows is right-aligned from the
      // viewer's perspective (far right edge of the row, text-align: right).
      // Missed-report chips are dog-level dates too, so they live here (last,
      // so the existing items never jump position when chips come and go).
      if (hasDates || hasMissed) {
        html += '<div class="dog-row__dates">';
        if (endStr) {
          html += '<div class="dog-row__date-item dog-row__date-item--end">' +
                    '<span class="dog-row__date-label">Training ends</span>' +
                    '<span class="dog-row__date-value">' + escapeHtml(endStr) + '</span>' +
                  '</div>';
        }
        if (break1) {
          html += '<div class="dog-row__date-item">' +
                    '<span class="dog-row__date-label">Break 1</span>' +
                    '<span class="dog-row__date-value">' + escapeHtml(break1) + '</span>' +
                  '</div>';
        }
        if (break2) {
          html += '<div class="dog-row__date-item">' +
                    '<span class="dog-row__date-label">Break 2</span>' +
                    '<span class="dog-row__date-value">' + escapeHtml(break2) + '</span>' +
                  '</div>';
        }
        if (hasMissed) {
          html += '<div class="dog-row__date-item dog-row__date-item--reports">' +
                    '<span class="dog-row__date-label">Missed reports</span>' +
                    '<span class="report-chips">';
          missed.forEach(function (mr) {
            html += '<button type="button" class="report-chip report-chip--age' + mr.age + '"' +
                    ' data-dog-id="' + escapeHtml(dog.id) + '"' +
                    ' data-date="' + escapeHtml(mr.date) + '">' +
                    escapeHtml(formatDateChip(mr.date)) +
                    '</button>';
          });
          html += '</span></div>';
        }
        html += '</div>'; // .dog-row__dates
      }

      html += '</div>'; // .dog-row
    });

    // The full-innerHTML replace below destroys any focused chip; remember it
    // by identity (dogId|date) and re-focus after the render so a D-pad user
    // mid-navigation isn't silently deselected by the 30s poll.
    var focusedChip = closestChip(document.activeElement);
    var focusKey = focusedChip
      ? focusedChip.getAttribute('data-dog-id') + '|' + focusedChip.getAttribute('data-date')
      : null;

    content.innerHTML = html;

    if (focusKey) {
      var newChips = content.querySelectorAll('.report-chip');
      for (var ci = 0; ci < newChips.length; ci++) {
        if (newChips[ci].getAttribute('data-dog-id') + '|' +
            newChips[ci].getAttribute('data-date') === focusKey) {
          newChips[ci].focus();
          break;
        }
      }
      // If the chip is gone (deleted, or its report arrived) focus simply
      // drops — the next arrow press re-enters at the first chip.
    }

    // Update conflict count in footer
    var conflictEl = document.getElementById('conflict-count');
    if (totalConflicts > 0) {
      conflictEl.textContent = totalConflicts + ' time slot conflict' + (totalConflicts > 1 ? 's' : '');
    } else {
      conflictEl.textContent = '';
    }
  }

  // No scrolling on the TV: every dog must stay on screen. When the list is
  // taller than the viewport, scale it down proportionally (zoom recomputes
  // layout, so client/scroll heights are re-measured until it fits).
  function fitToScreen() {
    var el = document.getElementById('schedule-content');
    if (!el) return;
    el.classList.remove('schedule-content--compact');
    el.style.zoom = '';
    for (var i = 0; i < 5 && el.scrollHeight > el.clientHeight; i++) {
      var current = parseFloat(el.style.zoom) || 1;
      var next = current * (el.clientHeight / el.scrollHeight) * 0.99;
      if (next < 0.4) { next = 0.4; } // readability floor — below this stop shrinking
      el.style.zoom = String(next);
      if (next === 0.4) break;
    }
    // At the readability floor, reduce decorative spacing before allowing any
    // row to be clipped. This preserves the product's single-screen invariant.
    if (el.scrollHeight > el.clientHeight) {
      el.classList.add('schedule-content--compact');
      el.style.zoom = '';
      for (var j = 0; j < 5 && el.scrollHeight > el.clientHeight; j++) {
        var compactCurrent = parseFloat(el.style.zoom) || 1;
        var compactNext = compactCurrent * (el.clientHeight / el.scrollHeight) * 0.99;
        if (compactNext < 0.4) compactNext = 0.4;
        el.style.zoom = String(compactNext);
        if (compactNext === 0.4) break;
      }
    }
    document.body.classList.toggle('schedule-overflow', el.scrollHeight > el.clientHeight);
  }

  function updateClock() {
    var now = new Date();
    document.getElementById('current-date').textContent = formatDateLong(now);
    document.getElementById('current-time').textContent = formatTime(now);
  }

  function updateFooter() {
    var footer = document.getElementById('last-updated');
    if (footer) {
      if (fetchFailed && lastFetchTime) {
        footer.textContent = 'Offline \u2014 last data from ' + formatTime(lastFetchTime);
        footer.style.color = '#FF5252';
      } else if (lastFetchTime) {
        footer.textContent = 'Last synced: ' + formatTime(lastFetchTime);
        footer.style.color = '';
      } else {
        footer.textContent = 'Connecting...';
      }
    }

    // Muted note when report data is unavailable (fetch failed server-side or
    // backend not serving it) \u2014 distinct from the offline state above, and
    // quiet on purpose: chips simply don't render rather than lie.
    var reportStatus = document.getElementById('report-status');
    if (reportStatus) {
      reportStatus.textContent =
        (lastFetchTime && cachedData.reports === null) ? 'Report data unavailable' : '';
    }
  }

  // ---- Init ----

  function init() {
    updateClock();

    // Initial fetch and render
    fetchFromSheets(function () {
      renderSchedule();
      fitToScreen();
      updateFooter();
    });

    // Re-fit if the TV/browser window changes size
    window.addEventListener('resize', fitToScreen);

    // Missed-report chips: delegated click (survives every innerHTML
    // re-render) + D-pad keyboard navigation for arrow-key TV browsers.
    var scheduleEl = document.getElementById('schedule-content');
    if (scheduleEl) {
      scheduleEl.addEventListener('click', function (e) {
        var chip = closestChip(e.target);
        if (!chip) return;
        dismissChip(chip.getAttribute('data-dog-id'), chip.getAttribute('data-date'));
      });
    }
    document.addEventListener('keydown', handleChipKeydown);

    // Update clock every second
    setInterval(updateClock, CLOCK_INTERVAL);

    // Refresh from Sheets every 30 seconds
    setInterval(function () {
      fetchFromSheets(function () {
        renderSchedule();
        fitToScreen();
        updateFooter();
      });
    }, REFRESH_INTERVAL);
  }

  // Test-only seam for .claude/report-tracker-test.js and DevTools time
  // travel (mirrors the planner's FT.Planner._test precedent). NOT a UI
  // contract. Example: __FT_DISPLAY_TEST.overrideNow({todayStr:'2026-08-05',
  // minutes:1020}); __FT_DISPLAY_TEST.rerender();  — clear with overrideNow(null).
  if (typeof window !== 'undefined') {
    window.__FT_DISPLAY_TEST = {
      computeMissedReports: computeMissedReports,
      addDaysToDateStr: addDaysToDateStr,
      dayOfWeekFromStr: dayOfWeekFromStr,
      inBreakWindow: inBreakWindow,
      formatDateChip: formatDateChip,
      getTodayStr: getTodayStr,
      getClearedDates: getClearedDates,
      dismissChip: dismissChip,
      overrideNow: function (parts) { nowOverride = parts || null; },
      setReports: function (r) { cachedData.reports = r; },
      setDismissed: function (d) { cachedData.dismissed = d || {}; },
      rerender: function () { renderSchedule(); fitToScreen(); updateFooter(); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
