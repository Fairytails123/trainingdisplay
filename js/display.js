/* ============================================
   display.js — TV Display (read-only dashboard)
   Fetches data from Google Sheets API
   Auto-refreshes every 30 seconds
   ============================================ */

(function () {
  'use strict';

  var REFRESH_INTERVAL = 30000; // 30 seconds
  var CLOCK_INTERVAL = 1000;    // 1 second
  var SHEETS_URL_KEY = 'ft_display_sheets_url';
  var DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzBzTZKpAHKidIsa653UWCo-TbUOgxCTbqyE69obmV2rij_0cJsnSsciOcZci564RrR/exec';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // In-memory data cache (populated from Sheets API)
  var cachedData = {
    dogs: [],
    slotsByDate: {},
    timeSlots: [],
    equipment: []
  };
  var lastFetchTime = null;
  var fetchFailed = false;

  // ---- Sheets URL config ----

  function getSheetsUrl() {
    return localStorage.getItem(SHEETS_URL_KEY) || DEFAULT_SHEETS_URL;
  }

  function setSheetsUrl(url) {
    localStorage.setItem(SHEETS_URL_KEY, url || '');
  }

  // ---- Data fetching ----

  function fetchFromSheets(onComplete) {
    var url = getSheetsUrl();
    if (!url) {
      fetchFailed = true;
      if (onComplete) onComplete(false);
      return;
    }

    var footer = document.getElementById('last-updated');
    if (footer) footer.textContent = 'Syncing...';

    fetch(url + '?action=getAll')
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

  function getDog(id) {
    return cachedData.dogs.find(function (d) { return d.id === id; }) || null;
  }

  function getSlots(dateStr) {
    return cachedData.slotsByDate[dateStr] || {};
  }

  // ---- Date helpers ----

  function getTodayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function formatDateLong(date) {
    return DAYS[date.getDay()] + ' ' +
           date.getDate() + ' ' +
           MONTHS[date.getMonth()] + ' ' +
           date.getFullYear();
  }

  function formatTime(date) {
    return String(date.getHours()).padStart(2, '0') + ':' +
           String(date.getMinutes()).padStart(2, '0');
  }

  function isCurrentSlot(slot) {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var match = slot.label.match(/(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})/);
    if (!match) return false;
    var startMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
    var endMinutes = parseInt(match[3]) * 60 + parseInt(match[4]);
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // ---- Config overlay ----

  function showConfigOverlay() {
    var existing = document.getElementById('config-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'config-overlay';
    overlay.innerHTML =
      '<div class="config-modal">' +
        '<h2 class="config-title">Display Setup</h2>' +
        '<p class="config-text">Enter the Google Apps Script URL from your training planner Google Sheet.</p>' +
        '<input type="url" class="config-input" id="config-url" value="' + getSheetsUrl() + '" placeholder="https://script.google.com/macros/s/...">' +
        '<div class="config-status" id="config-status"></div>' +
        '<div class="config-actions">' +
          '<button class="config-btn config-btn--test" id="config-test">Test</button>' +
          '<button class="config-btn config-btn--save" id="config-save">Save & Connect</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('config-test').addEventListener('click', function () {
      var url = document.getElementById('config-url').value.trim();
      var status = document.getElementById('config-status');
      if (!url) { status.textContent = 'Please enter a URL.'; return; }
      status.textContent = 'Testing...';
      fetch(url + '?action=ping')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          status.textContent = d.success ? 'Connected!' : 'Failed: ' + (d.error || 'Unknown error');
          status.style.color = d.success ? '#A5D6A7' : '#FF5252';
        })
        .catch(function (e) {
          status.textContent = 'Error: ' + e.message;
          status.style.color = '#FF5252';
        });
    });

    document.getElementById('config-save').addEventListener('click', function () {
      var url = document.getElementById('config-url').value.trim();
      setSheetsUrl(url);
      overlay.remove();
      fetchFromSheets(function () {
        renderSchedule();
        updateFooter();
      });
    });
  }

  // ---- Render ----

  function renderSchedule() {
    var content = document.getElementById('schedule-content');
    var todayStr = getTodayStr();
    var timeSlots = getTimeSlots();
    var equipment = getEquipment();
    var assignments = getSlots(todayStr);
    var dogs = getDogs().filter(function (d) { return !d.archived; });
    var url = getSheetsUrl();

    if (!url) {
      content.innerHTML =
        '<div class="no-data">' +
          '<div class="no-data__icon">&#9881;</div>' +
          '<div class="no-data__title">Setup required</div>' +
          '<div class="no-data__text">Click the gear icon to enter your Google Sheets API URL.</div>' +
          '<button class="config-btn config-btn--save" onclick="document.getElementById(\'config-gear\').click()">Configure</button>' +
        '</div>';
      return;
    }

    if (dogs.length === 0) {
      content.innerHTML =
        '<div class="no-data">' +
          '<div class="no-data__icon">&#128054;</div>' +
          '<div class="no-data__title">No training schedule</div>' +
          '<div class="no-data__text">' + (fetchFailed ? 'Could not connect to Google Sheets. Retrying...' : 'No dogs found. Add dogs in the Training Planner.') + '</div>' +
        '</div>';
      document.getElementById('conflict-count').textContent = '';
      return;
    }

    var html = '';
    var totalConflicts = 0;

    timeSlots.forEach(function (slot) {
      var assignedDogs = [];
      Object.keys(assignments).forEach(function (dogId) {
        if (assignments[dogId].slotId === slot.id) {
          var dog = getDog(dogId);
          if (dog && !dog.archived) {
            assignedDogs.push(dog);
          }
        }
      });

      var hasConflict = assignedDogs.length > 1;
      if (hasConflict) totalConflicts += assignedDogs.length;
      var isCurrent = isCurrentSlot(slot);

      html += '<div class="slot-row' +
        (isCurrent ? ' active' : '') +
        (hasConflict ? ' conflict' : '') + '">';

      html += '<div class="slot-row__time ' + slot.period + '">' +
        '<span>' + slot.shortLabel + '</span>' +
        '<span class="slot-row__time-label">' + (slot.period === 'am' ? 'Morning' : 'Afternoon') + '</span>' +
      '</div>';

      html += '<div class="slot-row__dogs">';

      if (assignedDogs.length === 0) {
        html += '<span class="slot-row__empty">No dogs scheduled</span>';
      } else {
        assignedDogs.forEach(function (dog) {
          html += '<div class="dog-entry">';
          html += '<span class="dog-entry__name">' + dog.name + '</span>';
          if (dog.breed) {
            html += '<span class="dog-entry__breed">' + dog.breed + '</span>';
          }
          if (dog.equipment && dog.equipment.length > 0) {
            html += '<div class="dog-entry__equipment">';
            dog.equipment.forEach(function (eqId) {
              var eq = equipment.find(function (e) { return e.id === eqId; });
              if (eq) {
                html += '<span class="equip-tag" style="background:' + eq.colour +
                        ';color:' + eq.textColour + ';">' + eq.label + '</span>';
              }
            });
            html += '</div>';
          }
          if (hasConflict) {
            html += '<span class="conflict-indicator">CONFLICT</span>';
          }
          html += '</div>';
        });
      }

      html += '</div>';
      html += '</div>';
    });

    content.innerHTML = html;

    var conflictEl = document.getElementById('conflict-count');
    if (totalConflicts > 0) {
      conflictEl.textContent = totalConflicts + ' scheduling conflict' + (totalConflicts > 1 ? 's' : '');
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
      footer.textContent = 'Offline — last data from ' + formatTime(lastFetchTime);
      footer.style.color = '#FF5252';
    } else if (lastFetchTime) {
      footer.textContent = 'Last synced: ' + formatTime(lastFetchTime);
      footer.style.color = '';
    } else {
      footer.textContent = 'Not connected';
    }
  }

  // ---- Init ----

  function init() {
    updateClock();

    // Add gear icon to header
    var headerRight = document.querySelector('.header-right');
    if (headerRight) {
      var gear = document.createElement('button');
      gear.id = 'config-gear';
      gear.className = 'config-gear-btn';
      gear.innerHTML = '&#9881;';
      gear.title = 'Settings';
      gear.addEventListener('click', showConfigOverlay);
      headerRight.appendChild(gear);
    }

    // Initial fetch and render
    var url = getSheetsUrl();
    if (url) {
      fetchFromSheets(function () {
        renderSchedule();
        updateFooter();
      });
    } else {
      renderSchedule();
    }

    // Update clock every second
    setInterval(updateClock, CLOCK_INTERVAL);

    // Refresh from Sheets every 30 seconds
    setInterval(function () {
      if (getSheetsUrl()) {
        fetchFromSheets(function () {
          renderSchedule();
          updateFooter();
        });
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
