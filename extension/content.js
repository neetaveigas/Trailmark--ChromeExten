/*
 * Trailmark content script.
 *
 * Runs after shared/events.js and shared/tracking-logic.js (see the manifest's
 * content_scripts js list). Day 3 (#10) only checks that the shared code
 * loaded; page view and click tracking are added on day 4 (PLAN.md).
 */
(function () {
  'use strict';
  if (!globalThis.TrailmarkEvents || !globalThis.TrailmarkTracking) {
    return;
  }
})();
