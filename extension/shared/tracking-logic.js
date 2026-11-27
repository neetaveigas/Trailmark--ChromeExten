/*
 * Trailmark tracking logic (pure, no browser APIs).
 *
 * Placeholder created on day 3 (#10) so the build, the manifest and
 * importScripts() already load the final file layout. Dwell-time, restricted
 * flag, and scroll/typing burst logic are added from day 4 onward (PLAN.md).
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./events.js'));
  } else {
    root.TrailmarkTracking = factory(root.TrailmarkEvents);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Events) {
  'use strict';
  if (!Events) {
    throw new Error('tracking-logic.js needs events.js to be loaded first');
  }
  return {};
});
