/*
 * Trailmark serial queue (pure, no browser APIs).
 *
 * Placeholder created on day 3 (#10) so the build and importScripts() already
 * load the final file layout. createSerialQueue() and its tests are added on
 * day 5 (Issue #3, DESIGN.md section 5).
 */
(function (root) {
  'use strict';

  const SerialQueue = {};

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SerialQueue;
  } else {
    root.TrailmarkSerialQueue = SerialQueue;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
