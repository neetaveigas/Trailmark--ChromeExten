# Trailmark Design (DESIGN.md)

## 1. Purpose and boundaries

Trailmark has three runtime parts: a content script inside allowed web pages, a
Chrome extension service worker, and a local Node.js collector. A Node.js build
script creates the Manifest V3 extension in `dist/`. The extension sends data
only to `http://localhost:4317`; it does not send anything to an external
service.

The parts live in **two GitHub repositories** (Issue #8):

| Repository | Contains |
| --- | --- |
| [`Trailmark--ChromeExten`](https://github.com/neetaveigas/Trailmark--ChromeExten) (this one) | The extension (content script, service worker, popup), the build script, extension tests, and this `DESIGN.md` and `PLAN.md` |
| [`trailmark-collector`](https://github.com/neetaveigas/trailmark-collector) | The Node collector server, its dashboard and manual test page, its tests, and its own `README.md` and `package.json` |

They run in different places and change for different reasons. The only
thing they share is the **event contract** in section 4: what the extension
sends and what the collector accepts and returns. This document remains the
design for the whole system, including the collector; the collector
repository's README covers how to install and start it, its endpoints, and
the event fields it expects, and links back to section 4.

The extension records limited interaction metadata. It must not collect typed
or displayed text, passwords, clipboard contents, pressed-key values, full
URLs, query strings, or tab titles.

## 2. Components and event flow

```text
======== Repository: Trailmark--ChromeExten (extension) ========

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
                             - POST /events (application/json)
                                      |
- - - - - - - - - - - - - - - - - - - | - - - - - - - - - - - - - -
      event contract (section 4):     |   the only link between
      fields, endpoints, responses    |   the two repositories
- - - - - - - - - - - - - - - - - - - | - - - - - - - - - - - - - -
                                      v
======== Repository: trailmark-collector (collector) ========

                          Local Node collector :4317 (npm start)
                          - rejects non-JSON POSTs (415)
                          - validates and stores events
                          - serves latest 200 as JSON at GET /events
                          - keeps running totals of all events,
                            served as JSON at GET /summary
                          - static dashboard at / builds the table
                            in the browser with textContent
                          - serves a manual test page at /test
```

For a click, the content script reads only the target's tag, `id`, `name`,
`class`, and `type`; it never reads the target's text or value. It sends a
Trailmark-shaped message using `chrome.runtime.sendMessage`. The service worker
checks the message shape, adds shared fields and sends JSON with `fetch` to the
collector, always with `Content-Type: application/json`. The collector rejects
any `POST /events` that is not `application/json` (section 6), validates the
required fields, stores valid events, and shows them on its local page.

Tab events start in top-level `chrome.tabs` listeners in the service worker.
The worker resolves a hostname only when Chrome grants access through the
configured host permissions. Otherwise it sends `restricted: true` and omits
the hostname. It never sends a full address.

## 3. Planned file layout

The two repositories are cloned side by side in the same parent folder (for
example `D:\TRAILMARK` and `D:\trailmark-collector`). Neither imports code
from the other.

**`Trailmark--ChromeExten` (this repository, the extension):**

```text
trailmark.config.json
manifest.template.json
package.json                (build, test, and collector scripts; see below)
README.md                   (links to the collector repository)
DESIGN.md, PLAN.md
scripts/
  build.js
extension/
  service-worker.js
  content.js
  popup.html, popup.js, popup.css
  shared/
    events.js
    tracking-logic.js
    serial-queue.js
test/
  events.test.js
  tracking-logic.test.js
  serial-queue.test.js
  build.test.js
  contract.test.js          (built events match the contract examples)
  fixtures/
    contract-examples.json  (same file as in trailmark-collector)
```

**`trailmark-collector` (separate repository, the collector):**

```text
package.json                (npm start / npm run collector, npm test)
README.md                   (install/start, endpoints, expected event fields)
server.js                   (Node only: HTTP routes, storage, validation)
summary.js                  (pure: addToSummary(summary, event) running totals)
public/
  dashboard.html            (static page served at /, no event data inside)
  dashboard.js              (browser: fetches /events and /summary, builds tables)
  dashboard-format.js       (pure: event/summary -> plain cell strings)
  test-page.html            (manual test page served at /test)
test/
  collector.test.js         (HTTP routes, 415/400, headers)
  summary.test.js
  dashboard-format.test.js
  contract.test.js          (every contract example is accepted)
  fixtures/
    contract-examples.json  (same file as in this repository)
```

**Commands.** This repository's `npm run build` and `npm test` cover only the
extension. Its `npm run collector` runs
`npm --prefix ../trailmark-collector start`, so the FR-1.5 command still
works from here as long as both repositories are cloned side by side. In
`trailmark-collector`, `npm start` (also `npm run collector`) starts the
collector at `http://localhost:4317`, and `npm test` runs the collector
tests.

The build script fills the manifest template and injects the configured site
key into generated extension code. `dist/` is generated output, not source.

**What `build.js` writes to `dist/` (Issue #6).** The manifest, the service
worker, the content script, and the popup all load shared code from
`shared/...` paths **relative to `dist/`**, but the source files live in
`extension/shared/`. The build therefore:

1. Deletes any old `dist/` so stale files never linger.
2. Copies `extension/service-worker.js`, `extension/content.js`, and
   `extension/popup.html`, `popup.js`, `popup.css` to the root of `dist/`.
3. Copies the whole `extension/shared/` folder to `dist/shared/`
   (`events.js`, `tracking-logic.js`, `serial-queue.js`). Without this step
   `importScripts()` in the worker, the content script `js` list, and the
   popup's `<script>` tags would all point at missing files and the
   extension would fail to load.
4. Writes the generated `manifest.json` and injects the site key.
5. Checks that every file the manifest refers to (`background.service_worker`,
   each `content_scripts[].js` entry, `action.default_popup`) exists in
   `dist/`, and stops with a clear error if one is missing.
The exact file names can change if implementation shows a simpler layout;
record any agreed change below.

Pure functions in `extension/shared/` will handle URL-to-hostname parsing,
event validation, dwell-time calculations, scroll/typing burst grouping, and
the serial queue that processes tab/window events one at a time (section 5).
The Node built-in test runner can test these modules without Chrome. Browser
API wiring stays in the service worker and content script. Collector request
handling is tested through Node's HTTP interface in the `trailmark-collector`
repository.

The next two subsections describe the collector's design. The code lives in
`trailmark-collector`; file paths there are relative to that repository's
root.

### Collector dashboard rendering (Issue #5; in `trailmark-collector`)

**Problem.** An earlier draft said the collector generates the dashboard
HTML on the server and uses `textContent` to stay XSS-safe. `textContent` and
`document.createElement` exist only in a browser, not in Node, so that could
not work. The risk is real: click events carry page-controlled values. Any
website can give an element `class="<img src=x onerror=alert(1)>"`, and that
string arrives in a `tmClick` event as data.

**Chosen approach: the dashboard table is built in the browser, never on the
server.**

- **`server.js` (Node) never builds HTML from event data.** It serves three
  fixed files from `public/` and returns event data only as JSON:
  - `GET /` serves `dashboard.html`, a static page with an empty table and
    `<script src="/dashboard-format.js">` and `<script src="/dashboard.js">`
    tags. It contains no event values.
  - `GET /events` returns the latest 200 stored events, newest first, as
    `Content-Type: application/json`, produced with `JSON.stringify`.
  - `GET /summary` returns the running totals (below) as
    `Content-Type: application/json`, with the same headers as `GET /events`.
  - `GET /test` serves the manual test page (it shows no event data).
- **`dashboard.js` (browser) builds the tables.** It calls
  `fetch('/events')` and `fetch('/summary')`, parses the JSON, and builds the
  event table and the summary tables the same way: rows and cells are
  created with `document.createElement` and each value is set with
  `cell.textContent = value`. It never uses `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` (NFR-3).
  It refreshes every 2 seconds by clearing the rows with `replaceChildren()`
  and rebuilding them.
- **`dashboard-format.js` (pure) turns data into strings.** It exports
  `toRowCells(event)`, which returns the plain strings shown in one event row
  (time, event, siteKey, source, hostname, details), and
  `toSummaryRows(summary)`, which turns the `GET /summary` JSON into rows of
  plain strings for the two summary tables. It does no counting. It uses the
  same universal wrapper pattern as `extension/shared/` (section 3), so
  `dashboard.html` loads it with a `<script>` tag and Node tests load it with
  `require()`. Only the small DOM loop in `dashboard.js` is left untested in
  Node; it is checked by hand.

### Collector running totals (FR-7.4; Issue #5 review, Issue #6; in `trailmark-collector`)

The 200-event list is only a recent window: older events are dropped. The
FR-7.4 summary (count per event type, total dwell time per website) must
include **every** valid event the collector has received, so it cannot be
computed from that list.

- **The collector keeps running totals, separate from the 200-event list.**
  After a `POST /events` passes the `415` Content-Type check and the `400`
  required-field check, `server.js` does two independent things: it adds the
  event to the list (dropping the oldest above 200), and it updates the
  totals with `summary = addToSummary(summary, event)`. Dropping an event
  from the list never changes the totals, so they keep growing.
- **`summary.js` holds the pure logic.** `addToSummary(summary,
  event) -> summary` returns an updated summary without mutating its input
  and without I/O, so the server calls it once per event and Node tests call
  it directly. `createSummary()` returns the empty starting value and
  `toSummaryJSON(summary)` produces the response body for `GET /summary`. It
  is a plain CommonJS module, because only Node uses it.
- **What is counted.**
  - `countsByEvent`: every valid event adds 1 to the count for its `event`
    name.
  - `dwellMsByHostname`: a `tmTabActivated` event adds `previousDwellMs` to
    the total for `previousHostname`. If later events also report dwell
    (for example when browser blur ends a dwell period, FR-5.5), they are
    added the same way and recorded in the event contract (section 4).
  - Dwell from a restricted previous tab (`previousRestricted: true`, no
    `previousHostname`; see section 4) is added to a single
    `restrictedDwellMs` total, so no time is silently lost or attributed to
    the wrong website.
  - `previousDwellMs` is only added if it is a finite number `>= 0`;
    anything else is ignored for the totals (the event is still counted).
- **Hostnames are untrusted keys.** Totals are kept in a `Map` (or an
  object created with `Object.create(null)`), so a hostname such as
  `__proto__` or `constructor` cannot change object behaviour.
- **Response shape** (`GET /summary`):
  ```json
  {
    "totalEvents": 1234,
    "countsByEvent": [{ "event": "tmClick", "count": 812 }],
    "dwellMsByHostname": [{ "hostname": "example.com", "dwellMs": 523000 }],
    "restrictedDwellMs": 41000
  }
  ```
  Arrays are used rather than objects keyed by hostname, so the browser
  never treats data as object keys. Counts are sorted by event name and
  dwell totals by `dwellMs`, largest first.
- **Lifetime.** Like the event list, the totals are kept in memory (FR-7.3
  allows memory or a file) and reset when the collector restarts. If events
  are later stored in a file, the totals are rebuilt at startup by running
  `addToSummary` over every stored event.

**Defense in depth.**

- `dashboard.html` is served with
  `Content-Security-Policy: default-src 'self'`. Scripts can load only from
  the collector itself, and inline scripts and inline event handlers (such as
  `onerror=`) are blocked. Even if markup were injected by mistake, it could
  not run.
- Every collector response sets `X-Content-Type-Options: nosniff`, so the
  browser never treats the JSON from `GET /events` or `GET /summary` as HTML
  or script.
- Because the collector sends no CORS headers (section 6, Issue #4), other
  websites cannot read `GET /events` or `GET /summary`. The event log and
  totals can only be read by pages served from `http://localhost:4317` and by
  tools such as `curl`.
- The `415` Content-Type rule (section 6) applies only to `POST /events`; the
  dashboard's `GET /events` and `GET /summary` requests are unaffected.
- The content script sends nothing on the collector origin except on `/test`
  (section 8, open question 5), so using the dashboard does not create events
  about itself.

**Alternative rejected: build the HTML in Node and escape every value.**
Escaping `&`, `<`, `>`, `"`, and `'` can be made safe, but it relies on never
forgetting an escape or using it in the wrong context (for example inside an
attribute or URL). Building the DOM in the browser with `textContent` makes
values plain text by construction, which is what NFR-3 asks for.

### Loading shared code without a bundler

Because Manifest V3 content scripts cannot run as ES modules, and no bundler
is permitted, shared pure modules (`extension/shared/`, copied by the build to
`dist/shared/`) are loaded across the content script, the service worker, the
popup, and Node tests as follows:

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
   importScripts('shared/events.js', 'shared/tracking-logic.js', 'shared/serial-queue.js');
   ```
   (`serial-queue.js` has no dependencies and is only needed by the worker, so
   it is not listed in the content script's `js` array.)
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

   **Strict Dependency Ordering Rule:** The `manifest.json` `content_scripts[].js`
   array, the service worker's `importScripts()` call, and the popup's
   `<script>` tags must all list dependencies in topological order (i.e.
   `events.js` must always be listed before dependent files like
   `tracking-logic.js`).

5. **Popup (`dist/popup.html`) (Issue #6):**
   The popup **does** use shared code. Site-key validation (FR-6.2: exactly
   22 characters, only letters, numbers, `_` and `-`) lives once in
   `shared/events.js` as `isValidSiteKey(key)`. The popup uses it to show the
   error next to the field, and the service worker uses the same function
   before applying a saved per-domain key (FR-6.4), so the two can never
   disagree. `popup.html` loads the shared file with a `<script>` tag before
   `popup.js`, in the same dependency order as the manifest:
   ```html
   <script src="shared/events.js"></script>
   <script src="popup.js"></script>
   ```
   Both must be external files. Manifest V3's default content security policy
   for extension pages blocks inline `<script>` blocks and inline event
   handlers, so `popup.html` contains no inline script. The popup needs only
   `events.js`; it does not load `tracking-logic.js` or `serial-queue.js`.
   `popup.js` reads `globalThis.TrailmarkEvents`, exactly like the content
   script. Node tests cover `isValidSiteKey` through `require()`.

## 4. Event contract (between the two repositories)

This section is the **contract between `Trailmark--ChromeExten` and
`trailmark-collector`** (Issue #8). The extension promises to send only events
in this shape; the collector promises to accept them and to respond as
described in "HTTP interface" below. Neither side may change the contract
alone.

**How the two sides stay in agreement.**

- This section is the single written source of the contract. The collector's
  README summarizes the fields it expects and links here.
- Both repositories keep an identical copy of
  `test/fixtures/contract-examples.json`: one valid example of every event
  type, plus a `contractVersion` number. The extension's `contract.test.js`
  checks that the events it builds have exactly these fields; the collector's
  `contract.test.js` checks that `POST /events` accepts every example.
- A contract change bumps `contractVersion`, updates this section, and updates
  the fixture file in **both** repositories on the same day, with a
  Decisions log entry. If the two fixture files differ, the change is not
  finished.
- The current contract is **version 1**.

### Event fields

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

**Page events also carry `hostname`.** Every event with `source: "page"`
(`tmPageView`, `tmClick`, `tmScroll`, `tmTypingBurst`) includes:

| Field | Meaning |
| --- | --- |
| `hostname` | Hostname of the page the event happened on, such as `example.com` (from `location.hostname` in the content script). Never the full address, path, query string, or fragment. |

Without it, a page view with only `path: "/settings"` could belong to any
website. The dashboard shows it in its hostname column, and the per-site key
(FR-6.4) is chosen by it. Worker events carry their own tab hostnames as
described in the table below.

Planned event-specific fields:

| Event | Additional fields |
| --- | --- |
| `tmPageView` | `path` (no query or fragment); `referrerHostname` (hostname only; omitted when there is no referrer). The required page-title field is on hold pending the privacy decision in section 8. |
| `tmClick` | `tag`, `id`, `name`, `class`, and `type` of the clicked element (each omitted when empty); never text or value |
| `tmScroll` (Should) | `direction` (`up` or `down`), `duration` (ms), `startPosition` and `endPosition` (px); close a burst after 150 ms without scrolling or when direction changes |
| `tmTypingBurst` (Should) | `keyCount` and `duration` (ms) only; group key presses less than 1 second apart; never key values |
| `tmTabActivated` | New tab: `tabId`, and either `hostname` or `restricted: true` (no hostname). Previous tab: `previousTabId`, `previousDwellMs`, and either `previousHostname` or `previousRestricted: true` (no previous hostname). See the rules below. |
| `tmTabClosed` | `tabId`, and either the last known `hostname` or `restricted: true` with no hostname |
| `tmBrowserBlur` (Should) | Common fields only. No page or URL details and no `timestamp` field; the time is `collectedAt`. |
| `tmBrowserFocus` (Should) | Common fields only. No page or URL details and no `timestamp` field; the time is `collectedAt`. |

**Restricted flags in `tmTabActivated` (Issue #6).** A tab switch involves two
tabs, and either one can be hidden from Trailmark (not in `allowedDomains`, a
`chrome://` page, or a blank tab). The event therefore carries two separate
flags so the collector can tell which tab was hidden:

- `restricted: true` means the **new** tab is hidden; `hostname` is omitted.
- `previousRestricted: true` means the **previous** tab is hidden;
  `previousHostname` is omitted.
- Each flag is only present when `true`, and a hostname and its flag are
  never both present.
- On the first activation of a session there is no previous tab, so
  `previousTabId`, `previousHostname`, `previousRestricted`, and
  `previousDwellMs` are all omitted.

The collector's running totals (section 3) add `previousDwellMs` to
`previousHostname`, or to `restrictedDwellMs` when `previousRestricted` is
`true`.

No event has a `timestamp` field. Every event already carries `collectedAt`
(when it happened) and `sentAt` (when it was sent), so a separate timestamp
would only repeat them.

No event contains a full URL, query string, fragment, page text, input value,
password data, clipboard data, or tab title. The implementation and tests will
also check serialized events for these prohibited values.

### HTTP interface (collector side of the contract)

The collector listens on `http://localhost:4317`. This URL is a single
constant in the extension's `scripts/build.js` (section 6).

| Request | Response |
| --- | --- |
| `POST /events` with `Content-Type: application/json` and one event as the body | `204 No Content` when the event is stored |
| `POST /events` whose `Content-Type` media type is not `application/json`, or is missing | `415 Unsupported Media Type`; body not parsed, nothing stored (section 6) |
| `POST /events` whose body is not valid JSON, is not a single object, or lacks a string `event`, a string `siteKey`, or an ISO date string `collectedAt` (FR-7.2) | `400 Bad Request`; nothing stored |
| `POST /events` with a body larger than 64 KB | `413 Payload Too Large`; nothing stored |
| `GET /events` | `200`, `application/json`: array of the latest 200 events, newest first, exactly as received |
| `GET /summary` | `200`, `application/json`: running totals of every stored event (section 3, "Collector running totals") |
| `GET /` | `200`, the static dashboard page |
| `GET /test` | `200`, the manual test page |
| Anything else | `404 Not Found` |

Error responses (`400`, `413`, `415`) have a JSON body
`{ "error": "<short reason>" }` that never repeats event values. Every
response sets `X-Content-Type-Options: nosniff`, and no response sends CORS
headers (section 6).

The collector checks only the fields it needs (FR-7.2) and stores the event
as received. It does not reject unknown event names or extra fields, so a
newer extension does not break an older collector; the extension's own
validation (NFR-4) and the contract tests are what keep the fields in line
with this section.

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
     not already exist in session storage.
   - **Race-condition-safe pattern:** When the worker wakes up, Chrome can fire
     multiple listeners near-simultaneously (e.g., a tab switch and a window focus
     event). A naive `async` lookup would let each concurrent caller read empty
     storage, generate its own UUID, and overwrite the previous one — leaving early
     events with a session ID that no longer exists. The fix is to cache the in-flight
     promise in a module-level variable so all concurrent callers share the same
     lookup:
     ```javascript
     let sessionIdPromise;

     function getOrCreateSessionId() {
       sessionIdPromise ??= (async () => {
         const session = await chrome.storage.session.get('browserSessionId');
         if (session.browserSessionId) return session.browserSessionId;
         const id = crypto.randomUUID();
         await chrome.storage.session.set({ browserSessionId: id });
         return id;
       })();
       return sessionIdPromise;
     }
     ```
     `sessionIdPromise` is intentionally a worker-lifetime variable — when the worker
     stops it is cleared, and the next call re-reads the already-persisted ID from
     `chrome.storage.session`. This is the same serialization principle as handling
     storage writes one-at-a-time (see Issue #3).
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
   - **`chrome.storage.session` only, with no fallback (Issue #6):** Dwell state is
     never read from or written to `chrome.storage.local`, not even as a fallback
     if a session read fails or returns nothing. Local storage survives a browser
     restart, so old dwell state could be picked up the next day and turned into a
     huge, wrong `previousDwellMs`. If the session state is missing, the worker
     treats it as "no active tab yet": the next activation starts a new dwell
     period and sends no previous-tab fields. `chrome.storage.local` holds only
     the `installId` and the popup's saved per-domain site keys.

### Processing tab and window events one at a time (Resolving Issue #3)

Every tab/window handler does a read-modify-write on the saved dwell state:
read it from `chrome.storage.session`, change it, and write it back. Storage
calls are asynchronous, so two events that arrive close together can overlap
and one update can silently overwrite the other:

1. `onActivated` reads the state.
2. `onFocusChanged` reads the same state.
3. `onActivated` writes its change.
4. `onFocusChanged` writes its change, overwriting step 3.

Switching tabs and switching windows often fire together, so this would
produce wrong dwell times in practice.

**Fix: a single promise queue for all state-changing handlers.** A small pure
helper, `createSerialQueue()` in `extension/shared/serial-queue.js`, chains
each task onto the previous one so only one handler works on the state at a
time:

```javascript
function createSerialQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(task);
      // Keep the chain alive even if a task fails, so one error
      // never blocks later events.
      tail = result.catch(() => {});
      return result;
    },
  };
}
```

The service worker creates one queue and routes every tab/window listener
through it. Listeners are still registered synchronously at the top level
(FR-4.4); only their bodies are queued:

```javascript
const stateQueue = TrailmarkQueue.createSerialQueue();

chrome.tabs.onActivated.addListener((info) => {
  stateQueue.run(() => handleTabActivated(info)).catch(logError);
});
chrome.tabs.onRemoved.addListener((tabId, info) => {
  stateQueue.run(() => handleTabClosed(tabId, info)).catch(logError);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  stateQueue.run(() => handleFocusChanged(windowId)).catch(logError);
});
```

Rules that keep this correct:

- **The whole read-modify-write happens inside one queued task.** A handler
  reads state, computes the new state, and finishes writing before the next
  task starts. No handler reads or writes dwell state outside the queue.
- **The dwell calculation stays pure.** Each handler calls a pure function in
  `tracking-logic.js` with the shape `(state, event, nowMs) -> { state, eventsToSend }`.
  The queued task only does the storage I/O around it, so the logic is tested
  in Node without Chrome.
- **Sending events does not block the queue.** The task persists the new state
  first, then hands the resulting events to the sender without awaiting the
  network. A slow or failed collector POST (FR-4.5) cannot delay the next tab
  event.
- **Failures are isolated.** A task that throws is logged and the queue moves
  on to the next task (`tail` swallows the rejection; the caller still sees
  and logs it).
- **Worker restarts.** The queue is a worker-lifetime variable, like
  `sessionIdPromise`. When the worker stops it is cleared, and the next event
  starts a fresh queue that reads the persisted state from
  `chrome.storage.session`. Storage, not memory, stays the source of truth.

The `browserSessionId` fix above uses the same principle for a one-time
initialization (a cached promise); the queue covers the repeated
read-modify-write of tab and dwell state.

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

### Reaching the collector on every tenant build (Issue #4, pending mentor feedback)

**Problem.** `host_permissions` is generated from `allowedDomains`. With
`["*"]` the pattern `*://*/*` happens to include `localhost`, but a tenant
limited to a short list (for example two company domains) would have no
permission for the collector. Chrome would then block the service worker's
`fetch` to `http://localhost:4317/events` as a CORS error, and no events would
arrive.

**Chosen approach: the build always adds the collector origin to
`host_permissions`.**

- `scripts/build.js` always appends `http://localhost:4317/*` to
  `host_permissions`, whatever `allowedDomains` contains, including `["*"]`.
  If the exact entry already exists it is not duplicated.
- The collector origin is added **only** to `host_permissions`, never to the
  content script's `matches`. It grants network access for the worker; it
  does not make the collector a tracked website. The rule from FR-1.3 that
  `host_permissions` and `matches` always match therefore applies to the
  `allowedDomains` entries; the collector entry is the one documented
  exception.
- The collector URL is a single constant in the build script, used both for
  the permission and for the URL injected into the worker, so the two cannot
  drift apart.
- Manifest generation is a pure function (`createManifest(config, template)`)
  exported from `scripts/build.js`, so it is unit-tested in Node without
  running a build.

Example output for a tenant with a short domain list:

```json
"host_permissions": [
  "*://example.com/*",
  "*://*.example.com/*",
  "http://localhost:4317/*"
],
"content_scripts": [
  {
    "matches": ["*://example.com/*", "*://*.example.com/*"],
    "js": ["shared/events.js", "shared/tracking-logic.js", "content.js"]
  }
]
```

(The exact patterns generated for each `allowedDomains` entry depend on the
domain syntax still to be confirmed in open question 2, section 8.)

**Alternative rejected: CORS headers on the collector.** The collector will
**not** send `Access-Control-Allow-Origin` headers and will not answer
`OPTIONS` preflight requests with CORS approval. An extension service worker
with host permission is not subject to CORS, so the headers are unnecessary.
Adding them would also let any web page the user visits POST fake events to
the collector, which works against FR-3.2 and NFR-4.

**Leaving out CORS headers is not enough on its own.** Without CORS approval,
the browser only blocks requests that need a preflight:

- A page that POSTs with `Content-Type: application/json` triggers a
  preflight. The collector gives no CORS approval, so the browser never sends
  the POST.
- A page can send the same JSON body as `Content-Type: text/plain`, or as a
  form post (`application/x-www-form-urlencoded` or `multipart/form-data`).
  These are "simple requests": there is **no preflight**, and the browser
  still delivers the request to the collector. The page only loses the
  ability to read the response.

**Collector rule: reject any `POST /events` that is not JSON.** The collector
checks the `Content-Type` header before reading the body. If its media type
(ignoring parameters such as `; charset=utf-8`, compared case-insensitively)
is not `application/json`, the collector replies `415 Unsupported Media Type`,
does not parse the body, and stores nothing. A missing `Content-Type` is
rejected the same way. Only after this check does the collector parse the
JSON and apply the required-field validation (FR-7.2, `400` on failure).

Together, the two rules close the gap: a web page cannot send
`application/json` without a preflight, the preflight gets no CORS approval,
and every request type that skips the preflight is rejected with `415`. The
extension is unaffected, because the service worker always sends
`Content-Type: application/json` and has host permission for the collector.

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
  The collector server never builds HTML from event data; it returns events
  as JSON from `GET /events`. The dashboard table is built in the browser by
  `public/dashboard.js` in the `trailmark-collector` repository, which creates
  DOM elements explicitly and
  sets every value with `textContent`. The dashboard is served with
  `Content-Security-Policy: default-src 'self'` and all responses with
  `X-Content-Type-Options: nosniff` (section 3, Issue #5).
- **NFR-4:** Validate message type, event name, source, and permitted field
  types in the service worker before forwarding a page message. Check the
  extension sender and accept only the known Trailmark event names and their
  whitelisted fields. The collector independently rejects any `POST /events`
  whose `Content-Type` is not `application/json` (`415`), sends no CORS
  headers (section 6), and validates its required event fields (`400`).
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
4. **Collector access approach (Issue #4):** *Resolved by mentor.* Approved
   once the `Content-Type` rule was added: always add
   `http://localhost:4317/*` to `host_permissions` (never to `matches`), send
   no CORS headers, and reject any non-JSON `POST /events` with `415`. See
   section 6 and the Decisions log.
5. **Tracking the local test page:** *Resolved by mentor for now.* The manual
   test page is served at `http://localhost:4317/test`, so the demo tenant
   needs `localhost` in `allowedDomains`, which also injects the content
   script into the collector's own dashboard at `/`. Agreed default: the
   content script sends nothing on the collector origin except on the `/test`
   path. Revisit when the collector moves to its own repository (Issue #8).
   *Revisited for Issue #8:* moving the collector code to its own repository
   does not change where it runs. It is still served from
   `http://localhost:4317`, with the dashboard at `/` and the test page at
   `/test`, so the agreed default still applies unchanged.

### Risks and responses

- **Tab hostname access without `tabs`:** Use configured host permissions and
  `chrome.tabs` event identifiers. If Chrome does not expose a hostname, mark
  the event restricted; never add the forbidden `tabs` permission to work
  around it.
- **Sensitive-looking element attributes:** Send only the explicitly required
  click attributes, never free-form page text or values. Verify event output
  manually and in unit tests.
- **Service worker timing/storage races:** Keep listeners top-level, run every
  tab/window state update through the serial queue (section 5), and test both
  simultaneous events and a worker restart during tab dwell.
- **Extension reload with an open page:** Validate message shape and handle a
  missing receiver without repeated logging; refresh the page to reconnect.
- **Schedule pressure:** Preserve every Must requirement and required test.
  The plan lists optional features to defer first.
- **The two repositories drift apart (Issue #8):** the extension could start
  sending a field the collector does not expect, or the collector could
  change a response the dashboard relies on. Response: section 4 is the one
  written contract, both repositories test against the same
  `contract-examples.json`, and any change bumps `contractVersion` and updates
  both repositories on the same day. During the demo, both repositories'
  `npm test` runs are shown.
- **The collector repository is not cloned next to the extension:** then
  `npm run collector` from this repository cannot find it. Response: this
  README and `PLAN.md` give the side-by-side clone steps, and the collector
  can always be started with `npm start` from its own folder.

### Decisions log

| Date | Decision | Alternative considered | Status / reason |
| --- | --- | --- | --- |
| Day 1 | Use Manifest V3, plain JavaScript, Node built-ins, and a local-only collector. | Framework, remote collector, or third-party analytics. | Proposed; matches technical rules and keeps data local. |
| Day 1 | Keep tab/session state in `chrome.storage.session` and the stable install ID in `chrome.storage.local`. | Keep state only in worker variables or persist all state permanently. | Proposed; worker restarts do not lose active dwell state, and closed-browser time is not counted. |
| Day 1 | Omit page titles unless the mentor resolves the FR-2.2 / NFR-1 conflict. | Always send the page title. | Pending mentor decision; privacy-safe default. |
| Day 1 | Load shared code without a bundler via ordered `content_scripts.js` array in manifest, service worker `importScripts`, and universal export wrapper (`globalThis`/CommonJS) for Node tests (resolving Issue #1). | Build-time script concatenation (`build.js` bundle) or ES modules with bundler. | Proposed; satisfies Chrome's content script module limitation cleanly without introducing bundler dependencies or build artifacts complexity. |
| Day 1 | Store `browserSessionId` in `chrome.storage.session`, lazily initialized on first access using a promise-cached pattern to prevent race conditions when multiple listeners fire at startup (resolving Issue #2). | Keep `browserSessionId` in service worker memory or persist in `local`. | Proposed; worker restarts do not fragment sessions into multiple IDs, and quitting the browser clears the session cleanly. |
| Day 2 | Process all tab/window state updates one at a time through a single promise queue (`createSerialQueue()` in `extension/shared/serial-queue.js`); each queued task does the full read-modify-write of dwell state, and collector sends are not awaited inside the queue (resolving Issue #3). | Independent async handlers (lost updates when `onActivated` and `onFocusChanged` overlap); a storage-level lock or version counter with retries. | Proposed; simplest way to prevent overlapping read-modify-write, keeps the dwell logic pure and testable, and one failed handler cannot block later events. |
| Day 2 | The build always adds `http://localhost:4317/*` to `host_permissions` (never to content-script `matches`), for every tenant including `["*"]`; the collector sends no CORS headers (addressing Issue #4). | Collector sends `Access-Control-Allow-Origin` and answers `OPTIONS`; rely on `*://*/*` covering localhost. | Approved by mentor in the Issue #4 review, conditional on the `Content-Type` rule below; works for tenants with short domain lists and needs no CORS support in the collector. |
| Day 2 | Correction from mentor review (Issue #4): the collector rejects any `POST /events` whose `Content-Type` is not `application/json` with `415 Unsupported Media Type` and stores nothing. The earlier claim that leaving out CORS headers alone blocks page POSTs was only half true: `text/plain` and form posts are simple requests with no preflight, so the browser still delivers them. | Rely on missing CORS headers alone; check the `Origin` header instead. | Approved by mentor; together with no CORS headers it stops web pages from posting fake events, and the extension already sends `application/json`. |
| Day 2 | Content script sends nothing on the collector origin except on `/test` (Issue #4, open question 5). | Serve the test page from a separate port. | Approved by mentor for now; revisit when the collector moves to its own repository (Issue #8). |
| Day 2 | Build the collector dashboard table in the browser: `server.js` serves a static `dashboard.html` and returns the latest 200 events as JSON from `GET /events`; `dashboard.js` builds rows with `createElement` and `textContent`; pure formatting lives in `dashboard-format.js`; dashboard served with `Content-Security-Policy: default-src 'self'` and `X-Content-Type-Options: nosniff` (Issue #5). | Generate the HTML in Node and escape `& < > " '` in every value; the earlier draft's server-side `textContent` (not possible in Node). | Approved by mentor in the Issue #5 review, conditional on the running-totals change below; values are plain text by construction (NFR-3), formatting stays testable in Node, and the CSP blocks inline script even if markup slips through. |
| Day 2 | Correction from mentor review (Issue #5; also Issue #6): the collector keeps running totals (count per event type, dwell per hostname) separate from the 200-event list, updated once per valid event with the pure `addToSummary(summary, event)` in `summary.js`, and served as JSON from `GET /summary`, which the dashboard renders with `textContent`. | Compute the summary in the browser from the latest 200 events (earlier draft), which undercounts once older events are dropped. | Pending mentor review; FR-7.4 totals include every event, and the counting logic is a pure function tested in Node. |
| Day 2 | Smaller fixes from the design review (Issue #6): `tmTabActivated` carries separate `restricted` (new tab) and `previousRestricted` (previous tab) flags; dwell state lives only in `chrome.storage.session` with no `chrome.storage.local` fallback; no event has a `timestamp` field (`collectedAt` covers it); `build.js` copies `extension/shared/` to `dist/shared/` and checks every manifest file exists; the popup loads `shared/events.js` with an external `<script>` tag before `popup.js` and uses the shared `isValidSiteKey()`. | One shared `restricted` flag; falling back to local storage; a separate `timestamp`; a popup with its own copy of the site-key check. | Pending mentor review; the collector can tell which tab was hidden, stale dwell state cannot survive a browser restart, the extension loads from `dist/`, and the popup and worker validate site keys the same way. |
| Day 2 | Move the collector to its own repository, `trailmark-collector` (Issue #8). Section 4 becomes the versioned contract between the repositories (event fields plus the collector's HTTP interface), checked by an identical `contract-examples.json` in both test suites. This repository's `npm run collector` starts the collector from `../trailmark-collector`. | Keep the collector in this repository under `collector/`; publish the contract as a shared npm package. | Pending mentor review; the two parts run in different places and change for different reasons, the contract becomes explicit, and no shared package or extra dependency is needed. |
| Day 2 | Correction from mentor review (Issue #8): every page event (`source: "page"`: `tmPageView`, `tmClick`, `tmScroll`, `tmTypingBurst`) carries `hostname`, the page's hostname only. Added to section 4, to both copies of `contract-examples.json`, and to the collector README. `contractVersion` stays 1 because nothing has been built against it yet. | Leave page events without a hostname (a path alone cannot say which website it belongs to). | Requested by mentor; the collector and dashboard can tell which website each page event came from, and NFR-1 still holds because only the hostname is sent. |

Do not begin feature implementation until the mentor has reviewed and approved
the design and plan.
