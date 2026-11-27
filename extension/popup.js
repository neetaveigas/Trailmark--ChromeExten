/*
 * Trailmark popup script. Loaded after shared/events.js (no inline scripts:
 * Manifest V3 blocks them). The per-site key form is added on day 8 (PLAN.md).
 */
(function () {
  'use strict';
  if (!globalThis.TrailmarkEvents) {
    document.getElementById('status').textContent = 'Shared code failed to load.';
  }
})();
