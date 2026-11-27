/*
 * Trailmark shared event helpers (pure, no browser APIs).
 *
 * Loaded by the content script and service worker (as TrailmarkEvents on
 * globalThis), by the popup with a <script> tag, and by Node tests with
 * require(). See DESIGN.md section 3, "Loading shared code without a bundler".
 */
(function (root) {
  'use strict';

  const SITE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

  /**
   * Returns the lowercase hostname of an http:// or https:// URL, or null for
   * anything else (chrome:// and other schemes, empty input, random text).
   * Never returns the path, query string, or fragment.
   */
  function hostnameFromUrl(url) {
    if (typeof url !== 'string' || url === '') {
      return null;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname === '' ? null : parsed.hostname.toLowerCase();
  }

  /**
   * FR-6.2: a site key is exactly 22 characters of letters, numbers, _ and -.
   * Used by the build, the popup, and the service worker.
   */
  function isValidSiteKey(key) {
    return typeof key === 'string' && SITE_KEY_PATTERN.test(key);
  }

  const Events = {
    hostnameFromUrl,
    isValidSiteKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Events;
  } else {
    root.TrailmarkEvents = Events;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
