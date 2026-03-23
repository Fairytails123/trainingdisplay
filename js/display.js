/* ============================================
   display.js — TV Display (read-only dashboard)
   Reads from localStorage (same device as planner)
   Auto-refreshes every 30 seconds
   ============================================ */

(function () {
  'use strict';

  var REFRESH_INTERVAL = 30000; // 30 seconds
  var CLOCK_INTERVAL = 1000;    // 1 second

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- Storage reading (mirrors planner's localStorage keys) ----

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getTimeSlots() {
    return read('ft_config_timeslots') || [
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

  function getEquipment() {
    return read('ft_config_equipment') || [];
  }

  function getDogs() {
    return read('ft_dogs') || [];
  }

  function getDog(id) {
    return getDogs().find(function (d) { return d.id === id; }) || null;
  }

  function getSlots(dateStr) {
    return read('ft_slots_' + dateStr) || {};
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

  /**
   * Check if the current time falls within a slot's time range.
   * Parses slot labels like "09:00 – 10:00".
   */
  function isCurrentSlot(slot) {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();

    var match = slot.label.match(/(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})/);
    if (!match) return false;

    var startMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
    var endMinutes = parseInt(match[3]) * 60 + parseInt(match[4]);

    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // ---- Render ----

  function renderSchedule() {
    var content = document.getElementById('schedule-content');
    var todayStr = getTodayStr();
    var timeSlots = getTimeSlots();
    var equipment = getEquipment();
    var assignments = getSlots(todayStr);

    // Check if we have any data
    var dogs = getDogs().filter(function (d) { return !d.archived; });

    if (dogs.length === 0) {
      content.innerHTML =
        '<div class="no-data">' +
          '<div class="no-data__icon">&#128054;</div>' +
          '<div class="no-data__title">No training schedule</div>' +
          '<div class="no-data__text">Open the Training Planner on this device to add dogs and assign slots.</div>' +
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

      // Time column
      html += '<div class="slot-row__time ' + slot.period + '">' +
        '<span>' + slot.shortLabel + '</span>' +
        '<span class="slot-row__time-label">' + (slot.period === 'am' ? 'Morning' : 'Afternoon') + '</span>' +
      '</div>';

      // Dogs column
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

          // Equipment tags
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

      html += '</div>'; // dogs
      html += '</div>'; // slot-row
    });

    content.innerHTML = html;

    // Conflict count
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

  function updateLastRefresh() {
    document.getElementById('last-updated').textContent =
      'Last updated: ' + formatTime(new Date());
  }

  // ---- Init ----

  function init() {
    updateClock();
    renderSchedule();
    updateLastRefresh();

    // Update clock every second
    setInterval(updateClock, CLOCK_INTERVAL);

    // Refresh schedule every 30 seconds
    setInterval(function () {
      renderSchedule();
      updateLastRefresh();
    }, REFRESH_INTERVAL);

    // Listen for localStorage changes from the planner (cross-tab)
    window.addEventListener('storage', function (e) {
      if (e.key && e.key.startsWith('ft_')) {
        renderSchedule();
        updateLastRefresh();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
