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
    equipment: []
  };
  var lastFetchTime = null;
  var fetchFailed = false;

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

  function fetchFromSheets(onComplete) {
    var footer = document.getElementById('last-updated');
    if (footer) footer.textContent = 'Syncing...';

    fetch(API_URL + '?action=getAll')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          cachedData.dogs = data.dogs || [];
          cachedData.slotsByDate = data.slotsByDate || {};
          cachedData.timeSlots = (data.timeSlots && data.timeSlots.length > 0) ? data.timeSlots : getDefaultTimeSlots();
          cachedData.equipment = data.equipment || [];
          lastFetchTime = new Date();
          fetchFailed = false;
        } else {
          fetchFailed = true;
        }
        if (onComplete) onComplete(data.success);
      })
      .catch(function (err) {
        console.warn('Fetch failed:', err.message);
        fetchFailed = true;
        if (onComplete) onComplete(false);
      });
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
      // Dogs with upcoming slots first, then alphabetical
      if (a.slots.length > 0 && b.slots.length === 0) return -1;
      if (a.slots.length === 0 && b.slots.length > 0) return 1;
      return a.dog.name.localeCompare(b.dog.name);
    });
  }

  // ---- Render ----

  function renderSchedule() {
    var content = document.getElementById('schedule-content');
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

    // Render each dog as a row
    schedules.forEach(function (entry) {
      var dog = entry.dog;
      var slots = entry.slots;
      var notes = entry.notes;
      var hasSlots = slots.length > 0;
      var hasNotes = notes.length > 0;
      var isEmpty = !hasSlots && !hasNotes;

      html += '<div class="dog-row' + (isEmpty ? ' dog-row--empty' : '') + '">';

      // Left column: dog info
      html += '<div class="dog-row__info">';
      html += '<div class="dog-row__name">' + escapeHtml(dog.name) + '</div>';
      if (dog.breed) {
        html += '<div class="dog-row__breed">' + escapeHtml(dog.breed) + '</div>';
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
      html += '</div>'; // .dog-row
    });

    content.innerHTML = html;

    // Update conflict count in footer
    var conflictEl = document.getElementById('conflict-count');
    if (totalConflicts > 0) {
      conflictEl.textContent = totalConflicts + ' time slot conflict' + (totalConflicts > 1 ? 's' : '');
    } else {
      conflictEl.textContent = '';
    }
  }

  function updateClock() {
    var now = new Date();
    document.getElementById('current-date').textContent = formatDateLong(now);
    document.getElementById('current-time').textContent = formatTime(now);
  }

  function updateFooter() {
    var footer = document.getElementById('last-updated');
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

  // ---- Init ----

  function init() {
    updateClock();

    // Initial fetch and render
    fetchFromSheets(function () {
      renderSchedule();
      updateFooter();
    });

    // Update clock every second
    setInterval(updateClock, CLOCK_INTERVAL);

    // Refresh from Sheets every 30 seconds
    setInterval(function () {
      fetchFromSheets(function () {
        renderSchedule();
        updateFooter();
      });
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
