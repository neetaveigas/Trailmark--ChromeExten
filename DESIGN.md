# Trailmark Design (DESIGN.md)

## 1. Purpose and boundaries

Trailmark has three runtime parts: a content script inside allowed web pages, a
Chrome extension service worker, and a local Node.js collector. A Node.js build
script creates the Manifest V3 extension in `dist/`. The extension sends data
only to `http://localhost:4317`; it does not send anything to an external
service.

The extension records limited interaction metadata. It must not collect typed
or displayed text, passwords, clipboard contents, pressed-key values, full
URLs, query strings, or tab titles.

## 2. Components and event flow

```text
trailmark.config.json (name, description, version, siteKey, allowedDomains)
+ manifest template
                  |
                  v
       Node build script -> dist/
                              |
                              v
Allowed web page            Extension service worker
content script              (Manifest V3)
  - safe page/click data ->  - validates messages
  - no text/password data    - adds common event fields
                             - tracks tab/dwell state
                             - persists state in chrome.storage
                             - POST /events
                                      |
                                      v
                          Local Node collector :4317
                          - validates and stores events
                          - displays latest 200 at /
                          - serves a manual test page at /test
```

For a click, the content script reads only the target's tag, `id`, `name`,
`class`, and `type`; it never reads the target's text or value. It sends a
Trailmark-shaped message using `chrome.runtime.sendMessage`. The service worker
checks the message shape, adds shared fields and sends JSON with `fetch` to the
collector. The collector validates the required fields, stores valid events,
and shows them on its local page.

Tab events start in top-level `chrome.tabs` listeners in the service worker.
The worker resolves a hostname only when Chrome grants access through the
configured host permissions. Otherwise it sends `restricted: true` and omits
the hostname. It never sends a full address.

## 3. Planned file layout

```text
trailmark.config.json
manifest.template.json
package.json
scripts/
  build.js
extension/
  service-worker.js
  content.js
  popup.html, popup.js, popup.css
  shared/
    events.js
    tracking-logic.js
collector/
  server.js
  page.js
  test-page.html
test/
  events.test.js
  tracking-logic.test.js
  collector.test.js
```

The build script fills the manifest template and injects the configured site
key into generated extension code. `dist/` is generated output, not source.
The exact file names can change if implementation shows a simpler layout;
record any agreed change below.

Pure functions in `extension/shared/` will handle URL-to-hostname parsing,
event validation, dwell-time calculations, and scroll/typing burst grouping.
The Node built-in test runner can test these modules without Chrome. Browser
API wiring stays in the service worker and content script; collector request
handling is tested through Node's HTTP interface.

### Loading shared code without a bundler

Because Manifest V3 content scripts cannot run as ES modules, and no bundler
is permitted, shared pure modules (`extension/shared/`) are loaded across the
three runtimes as follows:

1. **Content script (`dist/content.js`):**
   The generated `manifest.json` specifies an ordered array in `content_scripts[].js`:
   ```json
   "content_scripts": [
     {
       "matches": [ ... ],
       "js": [
         "shared/events.js",
         "shared/tracking-logic.js",
         "content.js"
       ]
     }
   ]
   ```
   Chrome executes these scripts sequentially in the content script's isolated
   world. Each shared script attaches its exports to `globalThis` under a
   namespaced property (e.g., `globalThis.TrailmarkEvents` and
   `globalThis.TrailmarkTracking`), making them immediately available to
   subsequent scripts without polluting the web page's window scope.

2. **Service worker (`dist/service-worker.js`):**
   The service worker executes as a **classic script** (the default in Manifest V3).
   The `manifest.json` `background` entry must **not** set `"type": "module"`, because
   `importScripts()` is only supported in classic service workers in Chrome; setting
   `"type": "module"` causes `importScripts()` to throw a fatal error and prevents the
   service worker from starting. At its top level, it loads shared scripts synchronously:
   ```javascript
   importScripts('shared/events.js', 'shared/tracking-logic.js');
   ```
   This ensures synchronous availability of all shared helpers upon worker
   startup and wake-up events.

3. **Node.js unit tests (`test/*.test.js`):**
   Node tests load shared files via standard CommonJS `require()`. Each shared
   file uses a lightweight universal export wrapper:
   ```javascript
   (function (root) {
     const Events = {
       // pure event helpers and validation logic
     };

     if (typeof module !== 'undefined' && module.exports) {
       module.exports = Events; // Node.js test runner
     } else {
       root.TrailmarkEvents = Events; // Browser / extension globalThis
     }
   })(typeof globalThis !== 'undefined' ? globalThis : this);
   ```
   This allows pure unit tests to run directly with `node --test` without any
   transpilation, bundling, or mock browser globals.

4. **Cross-module dependencies between shared files:**
   When one shared file depends on another (for example, `tracking-logic.js` using
   event validation helpers from `events.js`):
   - **In Node.js (`npm test`):** It resolves the dependency via `require('./events.js')`.
   - **In the browser (Content Script and Service Worker):** It reads `root.TrailmarkEvents`
     (or `globalThis.TrailmarkEvents`), which is guaranteed to be initialized because
     `events.js` is loaded earlier in the execution sequence.

   Example universal wrapper handling cross-file dependencies (`extension/shared/tracking-logic.js`):
   ```javascript
   (function (root, factory) {
     if (typeof module !== 'undefined' && module.exports) {
       // Node.js test environment
       const Events = require('./events.js');
       module.exports = factory(Events);
     } else {
       // Browser content script / classic service worker
       root.TrailmarkTracking = factory(root.TrailmarkEvents);
     }
   })(typeof globalThis !== 'undefined' ? globalThis : this, function (Events) {
     const TrackingLogic = {
       // logic utilizing Events helper functions...
     };
     return TrackingLogic;
   });
   ```

   **Strict Dependency Ordering Rule:** Both the `manifest.json` `content_scripts[].js`
   array and the service worker's `importScripts()` call must list dependencies in
   topological order (i.e. `events.js` must always be listed before dependent files like
   `tracking-logic.js`).

## 4. Event contract

Every event sent to the collector has these common fields:

| Field | Meaning |
| --- | --- |
| `event` | Trailmark event name, such as `tmClick` |
| `siteKey` | Tenant key from the build config, or a saved domain override |
| `installId` | Stable random UUID created once and stored locally |
| `browserSessionId` | Random ID for the current browser session |
| `collectedAt` | Event occurrence time in ISO format |
| `sentAt` | Time the service worker sends the event |
| `source` | `page` for page events; `worker` for browser/tab events |

Planned event-specific fields:

| Event | Additional fields |
| --- | --- |
| `tmPageView` | Path without query or fragment; referring page hostname only. The required page-title field is on hold pending the privacy decision in section 8. |
| `tmClick` | Target tag, `id`, `name`, `class`, and `type`; never text or value |
| `tmScroll` (Should) | Direction, duration, start position, end position; close a burst after 150 ms without scrolling or when direction changes |
| `tmTypingBurst` (Should) | Key count and duration only; group key presses less than 1 second apart; never key values |
| `tmTabActivated` | New tab hostname and `tabId`; previous `tabId`, previous hostname, and previous dwell time in milliseconds; restricted tabs have no hostname |
| `tmTabClosed` | Last known hostname, or `restricted: true` with no hostname |
| `tmBrowserBlur` (Should) | No page or URL details |
| `tmBrowserFocus` (Should) | No page or URL details |

No event contains a full URL, query string, fragment, page text, input value,
password data, clipboard data, or tab title. The implementation and tests will
also check serialized events for these prohibited values.

## 5. State and service-worker restarts

Because Manifest V3 service workers are ephemeral and terminate after ~30 seconds
of inactivity, in-memory global variables are cleared whenever the worker goes to
sleep. State is partitioned across `chrome.storage.local` and
`chrome.storage.session` to ensure continuity without state fragmentation:

### Identity & Session Storage Architecture

1. **`installId` (Permanent Local State):**
   - **Where it lives:** `chrome.storage.local`.
   - **When created:** Generated once as a random UUID via `crypto.randomUUID()`
     during extension installation (`chrome.runtime.onInstalled`). It remains
     constant across service worker restarts, browser updates, and browser sessions.

2. **`browserSessionId` (Session Lifetime State - Resolving Issue #2):**
   - **Where it lives:** `chrome.storage.session`.
   - **When created:** Created lazily the first time it is needed by the service
     worker (e.g., when the first event arrives or a tab listener fires) if it does
     not already exist in session storage:
     ```javascript
     async function getOrCreateSessionId() {
       const session = await chrome.storage.session.get('browserSessionId');
       if (session.browserSessionId) {
         return session.browserSessionId;
       }
       const newSessionId = crypto.randomUUID();
       await chrome.storage.session.set({ browserSessionId: newSessionId });
       return newSessionId;
     }
     ```
   - **Why `chrome.storage.session`:** It survives service worker idling, restarts,
     and wake-ups throughout the active browser run. When the user quits or closes
     the browser entirely, Chrome automatically purges `chrome.storage.session`.
     Upon the next browser launch, the first event lazily initializes a fresh
     `browserSessionId`, correctly establishing a single persistent ID per browser session.

3. **Tab & Dwell State (Session State):**
   - **Where it lives:** `chrome.storage.session`.
   - **Tracked data:** Active `tabId`, active `hostname`, dwell `startTimeMs`, and
     tab metadata. Storing this in session storage ensures that if the worker goes
     to sleep while a user is reading a tab, waking up on the next tab switch
     correctly computes the full dwell duration without losing the initial timestamp.
     Time is not counted while Chrome is completely closed because the session storage
     clears.

All Chrome event listeners are registered synchronously at the top level of the
service worker. Listener handlers read and update persisted storage rather than
relying on in-memory variables. A tab never observed before can be closed safely;
it produces a restricted close event rather than an error.

## 6. Manifest permissions

| Permission / access | Why it is needed |
| --- | --- |
| `storage` | Persist the install ID, browser-session tracking state, and optional popup domain keys |
| `host_permissions` for configured allowed domains | Run the content script on those sites and let the worker resolve permitted tab hostnames |
| `host_permissions` for `http://localhost:4317/*` | Allow the extension service worker to POST events to the local collector |

The domain entries in `host_permissions` and content-script `matches` are
generated from the same `allowedDomains` setting. The localhost collector
origin is a separate host permission because it is not a website to track.
There will be no `tabs` permission, and no `activeTab` or `scripting`
permission unless the approved design changes and the mentor agrees.

### Background Service Worker Configuration
The service worker is registered in `manifest.json` as a classic script:
```json
"background": {
  "service_worker": "service-worker.js"
}
```
**Important:** Do **not** set `"type": "module"`. In Chrome Manifest V3, `importScripts()` is only valid when the service worker is loaded as a classic script. If `"type": "module"` is added, `importScripts()` throws a runtime error and the extension service worker fails to start.

## 7. Privacy, security, and reliability rules

- **NFR-1:** Whitelist event fields instead of copying page or browser objects.
  Remove query strings and fragments from paths; reduce referrers and tab
  addresses to hostnames. Never read element text, input values, clipboard
  contents, or key values. Do not attach title fields unless the mentor
  resolves the conflict in section 8.
- **NFR-2:** The final README will include a "What Trailmark collects" table
  listing every event and each field.
- **NFR-3:** Do not use `eval`, `new Function`, or `innerHTML` with event data.
  Render collector values using `textContent` and create DOM elements
  explicitly.
- **NFR-4:** Validate message type, event name, source, and permitted field
  types in the service worker before forwarding a page message. Check the
  extension sender and accept only the known Trailmark event names and their
  whitelisted fields. The collector independently validates its required
  event fields.
- **NFR-5:** Check `chrome.runtime.lastError` in callback-based Chrome API
  calls. Handle rejected API calls and failed collector requests with a clear
  log; do not let an individual send crash the worker.
- **NFR-6:** Register listeners at top level, preserve necessary state in
  Chrome storage, and test the extension reload behavior. A stale page may
  report one bounded message-send error after reload; it must not repeatedly
  spam the console and must work again after refresh.

All event delivery uses localhost. No analytics, remote server, or external
package is planned. The project uses plain JavaScript and Node 18 or newer;
the collector uses Node built-ins only.

## 8. Risks, open questions, and decisions

### Open questions for the mentor

1. **Page title/privacy conflict:** FR-2.2 asks for a page title, but NFR-1
   prohibits text from the page and tab titles. The privacy-safe default is to
   omit titles. Ask the mentor whether a title is an approved exception before
   coding; do not silently collect it.
2. **Domain pattern syntax:** Confirm the expected forms for `allowedDomains`,
   especially wildcard domains and the special value `["*"]`, before writing
   validation.
3. **Day 1 repository:** Create a GitHub repository and send its link to
   `@Jesudas Lobo` on Slack as required. Confirm whether the mentor expects a
   different schedule if the work is part-time.

### Risks and responses

- **Tab hostname access without `tabs`:** Use configured host permissions and
  `chrome.tabs` event identifiers. If Chrome does not expose a hostname, mark
  the event restricted; never add the forbidden `tabs` permission to work
  around it.
- **Sensitive-looking element attributes:** Send only the explicitly required
  click attributes, never free-form page text or values. Verify event output
  manually and in unit tests.
- **Service worker timing/storage races:** Keep listeners top-level, serialize
  state updates, and test a worker restart during tab dwell.
- **Extension reload with an open page:** Validate message shape and handle a
  missing receiver without repeated logging; refresh the page to reconnect.
- **Schedule pressure:** Preserve every Must requirement and required test.
  The plan lists optional features to defer first.

### Decisions log

| Date | Decision | Alternative considered | Status / reason |
| --- | --- | --- | --- |
| Day 1 | Use Manifest V3, plain JavaScript, Node built-ins, and a local-only collector. | Framework, remote collector, or third-party analytics. | Proposed; matches technical rules and keeps data local. |
| Day 1 | Keep tab/session state in `chrome.storage.session` and the stable install ID in `chrome.storage.local`. | Keep state only in worker variables or persist all state permanently. | Proposed; worker restarts do not lose active dwell state, and closed-browser time is not counted. |
| Day 1 | Omit page titles unless the mentor resolves the FR-2.2 / NFR-1 conflict. | Always send the page title. | Pending mentor decision; privacy-safe default. |
| Day 1 | Load shared code without a bundler via ordered `content_scripts.js` array in manifest, service worker `importScripts`, and universal export wrapper (`globalThis`/CommonJS) for Node tests (resolving Issue #1). | Build-time script concatenation (`build.js` bundle) or ES modules with bundler. | Approved; satisfies Chrome's content script module limitation cleanly without introducing bundler dependencies or build artifacts complexity. |
| Day 1 | Store `browserSessionId` in `chrome.storage.session`, lazily initialized on first access if not present (resolving Issue #2). | Keep `browserSessionId` in service worker memory or persist in `local`. | Approved; worker restarts do not fragment sessions into multiple IDs, and quitting the browser clears the session cleanly. |

Do not begin feature implementation until the mentor has reviewed and approved
the design and plan.
