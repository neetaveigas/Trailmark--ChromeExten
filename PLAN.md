# Trailmark Plan (PLAN.md)

## 1. Milestone 1: design and plan (Days 1-2)

**Goal:** Get the design and schedule reviewed before writing feature code.

### Day 1 - Understand, draft, and share

1. Read the requirements and mark each feature Must or Should.
2. Create a GitHub repository for Trailmark and send its link to
   `@Jesudas Lobo` on Slack.
3. Complete `DESIGN.md`: components and event flow, source files, event fields,
   storage, privacy/security choices, permissions, risks, and open questions.
4. Complete this `PLAN.md`: what will be built each day, how it will be tested,
   and what will be deferred if time runs short.
5. Send the mentor the repository and ask for a 30-minute review. Do not start
   feature implementation yet.

**Where:** Edit the two Markdown files in the project workspace; create and
share the repository in GitHub and Slack. If working part-time, agree on a
longer schedule with the mentor while keeping milestone order.

### Day 2 - Review, revise, and get approval

1. Walk through the diagram and explain how a click reaches the local
   collector.
2. Explain each event field, permission, and storage choice, including the
   page-title conflict recorded in `DESIGN.md`.
3. Ask the mentor to resolve open questions and review the schedule.
4. Update the design's Decisions log and revise the plan based on feedback.
5. Create the separate collector repository, `trailmark-collector`, and share
   it with the mentor like this one (Issue #8).
6. Begin feature code only after the mentor has reviewed and approved both
   documents.

**Where:** 30-minute mentor call; record outcomes in `DESIGN.md` and
`PLAN.md` in the project workspace.

## 2. Build milestones (Days 3-9)

Each milestone ends with a working result that can be shown. Keep the work in
small commits and push progress to both repositories at least daily.

### Two repositories (Issue #8)

The work is split across two GitHub repositories, cloned side by side in the
same parent folder:

| Repository | Contains | Commands |
| --- | --- | --- |
| `Trailmark--ChromeExten` (this one) | Extension source, build script, `DESIGN.md`, `PLAN.md`, extension tests | `npm run build`, `npm test` (extension tests only), `npm run collector` (runs `npm --prefix ../trailmark-collector start`, so the FR-1.5 command still works from here) |
| `trailmark-collector` | Node collector server, dashboard, manual test page, collector tests, its own `README.md` and `package.json` | `npm start` (also `npm run collector`) starts `http://localhost:4317`; `npm test` runs the collector tests |

The event format in `DESIGN.md` section 4 is the contract between the two
repositories. Each repository keeps a copy of the same example events
(`test/fixtures/contract-examples.json`): the extension's tests check that the
events it builds match them, and the collector's tests check that it accepts
them. A change to the event format is made in both repositories in the same
day and noted in the Decisions log.

| Day | Work and requirements | Demonstrable result |
| --- | --- | --- |
| 3 | **Extension repo:** build pipeline and settings (`FR-1.1-1.5`), including the collector host permission on every tenant build (Issue #4); initial pure unit tests. **Collector repo:** set up `trailmark-collector` with its own `package.json`, `README.md` (install/start, endpoints, expected event fields), server, dashboard, and manual test page (`FR-7.1-7.3`); first collector tests; shared contract example events in both repos | Extension: `npm run build` creates a loadable `dist/` whose `host_permissions` includes `http://localhost:4317/*` even with a short `allowedDomains` list; `npm test` runs. Collector: `npm start` in `trailmark-collector` (or `npm run collector` from the extension repo) serves the static dashboard at `http://localhost:4317/` (table built in the browser from `GET /events`, Issue #5) and `/test`; valid event POST succeeds, invalid POST returns 400, and a non-JSON `Content-Type` returns 415; its `npm test` runs |
| 4 | Page view/click tracking and safe message flow (`FR-2.1-2.4`, `FR-3.1-3.2`, `FR-4.1-4.4`, `NFR-1,3-5`); unit tests for that day's shared logic in `shared/events.js`, written the same day (Issue #7) | A page on an allowed host produces page-view and click events in the collector; no element text/value or password data is sent; common fields are present. `npm test` passes for: the click-field whitelist (only tag, `id`, `name`, `class`, `type`; never text or value); path with query and fragment removed; referrer reduced to a hostname; password fields ignored; the worker's page-message validation (NFR-4) rejecting unknown event names, sources, and extra fields; and a serialized page-view/click event containing no full URL, query string, title, text, or value (NFR-1) |
| 5 | Tab activation, closing, restricted hosts, dwell time stored in `chrome.storage.session` (`FR-5.1-5.3`), and the serial queue for tab/window state updates (Issue #3); tests for dwell calculation, restricted flags, and the queue written the same day | Switch between tabs and close one; show host-only events and dwell time; restricted pages have no hostname; tests cover dwell calculation, closing an unseen tab, and two events arriving together |
| 6 | Mentor checkpoint and resilience: surviving a worker restart (`FR-5.6`, moved from day 5, Issue #7), extension reload (`FR-3.3`, `NFR-6`), failed sends (`FR-4.5`), and console errors (`NFR-5`) | Review progress with mentor; document changes; stop the service worker by hand while a tab is active, switch tabs, and show a correct `previousDwellMs`; reload the extension while a test page is open without repeated console errors; confirm operation resumes after refresh |
| 7 | Scroll and typing bursts, browser focus, and short-tab filtering (`FR-2.5-2.6`, `FR-5.5`, `FR-5.7`) | Show one grouped scroll event per completed scroll, a typing-burst event with counts only, and dwell time pausing outside Chrome; ignore tabs active for less than 300 ms; unit tests cover grouping, focus, and filtering |
| 8 | **Extension repo:** popup (`FR-6.1-6.4`) and domain-setting validation (`FR-1.6`). **Collector repo:** running totals and `GET /summary` (`FR-7.4`) | Save, list, and delete a per-domain site key; invalid key shows an error; events use the domain override; collector keeps running totals of all events (not just the latest 200), serves them at `GET /summary`, and the dashboard displays event counts and dwell totals |
| 9 | Stabilization and complete demo rehearsal in both repositories | Run the full demo flow, both repositories' tests, and checks for privacy leaks; complete both READMEs and list any skipped Should items as known issues |

### Day 10 - Final hand-in and demo

Run the demo on a call, show the passing `npm test` output from both
repositories, and confirm that this repository contains the final
`DESIGN.md`, `PLAN.md`, extension code, and README, and that
`trailmark-collector` contains the collector code, tests, and its own README.
This README must include setup/build/test instructions, a link to the
collector repository and how to start it, the "What Trailmark collects"
table, Known issues, and the final test output. The collector README covers
install/start, the endpoints, and the event fields it expects.

**Where:** Local Chrome and terminal for the demo; push final changes to both
GitHub repositories and share the latest commit of each with the mentor.

## 3. Build order and reasons

1. **Config, build, collector repository, and pure helpers:** Establish the
   event shape and the contract between the two repositories first, and set up
   `trailmark-collector` on day 3 so the extension has somewhere to send
   events from day 4. Test URL parsing and other tricky logic in Node before
   involving Chrome.
2. **Page-to-collector vertical slice:** Implement page view and click, content
   script messaging, worker validation, and collector POST. This verifies the
   main architecture early.
3. **Tab state and dwell time:** Add the most stateful behavior once event
   delivery works; persist state and unit-test calculations independently.
   Day 5 is the hardest day, so it only builds the tab logic. Dwell state is
   kept in `chrome.storage.session` from the start (the design requires it),
   so surviving a worker restart (FR-5.6) needs no extra code on day 5; it is
   proven on day 6.
   **If day 5 runs over:** finish tab activation, closing, and dwell time
   first, because the demo depends on them. Restricted-host edge cases and
   the serial-queue test move to the morning of day 6, before the check-in.
   If that still is not enough, the day 7 Should items move back and are cut
   in the order listed in section 5.
4. **Reload/error handling:** Exercise worker and collector failures before
   adding optional tracking, so the core demo remains dependable. Day 6 also
   proves FR-5.6 by stopping the service worker by hand during a tab dwell.
5. **Optional Should features and finish:** Add planned extras only after all
   Must requirements and their tests pass. Reserve the last build day for
   stabilization and documentation.

## 4. Testing and acceptance checks

Both repositories run `npm test` without opening a browser, using Node's
built-in test runner. Each repository's tests run on their own.

### Extension repository (`npm test` in this repository)

- Write each shared module's tests on the same day as the module, starting
  with the day 4 tests for `shared/events.js` (see the day 4 row). Day 9 is
  for edge cases and cleanup, not for writing the first tests.
- Manual FR-5.6 check on day 6: with a tab active, stop the service worker
  from `chrome://serviceworker-internals` (or wait past 30 seconds idle),
  then switch tabs and confirm `previousDwellMs` includes the time before the
  restart.
- Test hostname parsing for `https://`, `http://`, `chrome://`, empty input,
  and random text.
- Test dwell time across tab switches, and confirm closing an unseen tab does
  not throw.
- Test the `tmTabActivated` restricted flags (Issue #6) for all four cases:
  both tabs visible, only the new tab restricted, only the previous tab
  restricted, and both restricted. Each restricted tab has its flag set and
  no hostname; the first activation of a session has no previous-tab fields.
- Test that missing session dwell state is treated as "no active tab yet"
  (no previous-tab fields, no huge `previousDwellMs`), and that the dwell
  logic never reads `chrome.storage.local` (Issue #6).
- Test the serial queue (Issue #3): start two handlers at the same moment,
  such as a tab activation and a window focus change, against a fake async
  storage with a delay. Both updates must survive, the dwell time must be
  correct, and tasks must run in arrival order. A task that throws must not
  stop the next one from running.
- Test manifest generation (Issue #4) with `createManifest()` from
  `scripts/build.js`: for a short list such as `["example.com"]` and for
  `["*"]`, `host_permissions` contains `http://localhost:4317/*` exactly once,
  and the content script's `matches` never contains it. The `allowedDomains`
  entries in `host_permissions` and `matches` are identical.
- Test the build output (Issue #6): after `npm run build`, `dist/shared/`
  contains `events.js`, `tracking-logic.js`, and `serial-queue.js`; every file
  the manifest refers to exists in `dist/`; and a missing file stops the
  build with a clear error.
- Test `isValidSiteKey()` from `shared/events.js` (used by the popup and the
  worker): exactly 22 characters of letters, numbers, `_` and `-` pass; 21 or
  23 characters, spaces, and other symbols fail.
- Check serialized events contain no full URL, query string, tab title, page
  text, input value, key value, or password data, and that no event
  (including `tmBrowserBlur` and `tmBrowserFocus`) has a `timestamp` field.
- Add unit tests for every Should feature implemented, including pause/resume
  dwell behavior if browser blur/focus is included.
- Contract check (Issue #8): the events the extension builds for each event
  type match `test/fixtures/contract-examples.json`.

### Collector repository (`npm test` in `trailmark-collector`)

- Contract check (Issue #8): every event in
  `test/fixtures/contract-examples.json` is accepted by `POST /events`.
- Test that the collector does not send `Access-Control-Allow-Origin` on
  `POST /events` or `OPTIONS /events`.
- Test the collector's `Content-Type` rule (Issue #4 correction): a
  `POST /events` with `Content-Type: text/plain` and a valid JSON event body
  is rejected with `415` and stores nothing (the event list is unchanged
  afterwards). Also check that form content types and a missing
  `Content-Type` get `415`, and that `application/json; charset=utf-8` is
  accepted.
- Test the collector dashboard (Issue #5):
  - `GET /events` returns `application/json` with at most 200 events, newest
    first, and the `X-Content-Type-Options: nosniff` header.
  - An event whose `class` is `<img src=x onerror=alert(1)>` comes back from
    `GET /events` as the same plain string inside JSON, and `GET /` returns
    the same static `dashboard.html` bytes before and after it is stored (no
    event data in the HTML).
  - `GET /` sends `Content-Security-Policy: default-src 'self'`.
  - `toRowCells()` in `dashboard-format.js` returns plain strings (including
    the malicious `class` unchanged) and handles missing optional fields;
    `toSummaryRows()` turns a summary into plain string rows.
- Test the collector running totals (Issue #5 review, Issue #6):
  - Send more than 200 valid events (for example 250, including
    `tmTabActivated` events with dwell). `GET /events` returns only the
    latest 200, while `GET /summary` reports `totalEvents: 250`, counts per
    event type that add up to 250, and dwell totals that include the events
    no longer in the list.
  - Rejected `POST`s (`415` or `400`) do not change `GET /summary`.
  - `GET /summary` has the same headers as `GET /events` (`application/json`,
    `nosniff`).
  - Unit tests for `addToSummary()` in `summary.js`: counts per
    event type; dwell added to `previousHostname`; restricted dwell goes to
    `restrictedDwellMs`; negative, non-numeric, or missing `previousDwellMs`
    is ignored; a hostname of `__proto__` is stored as a normal entry; the
    input summary is not mutated.
  - Manually: store the malicious event, open the dashboard, and confirm the
    string is shown as text and no alert or console CSP violation from
    Trailmark code appears.
### Manual checks and demo

- Start the collector from its own repository: `cd ../trailmark-collector`
  then `npm start` (or `npm run collector` from this repository).
- Manually use the collector's `/test` page to try buttons, scrolling, a text
  field, and a password field. The password field must produce no event data.
- Demo: build and load `dist/` from this repository, start the collector from
  `trailmark-collector`, show page events and password privacy, switch/close
  tabs and show dwell events, run `npm test` in both repositories, and show
  any completed Should features.

## 5. What to defer if behind

Defer optional work in this order; do not drop Must requirements, privacy and
security rules, or the required tests:

1. Per-domain popup and collector summary statistics.
2. Browser blur/focus, short-tab filtering, scroll grouping, and typing bursts.
3. Domain validation polish and any unplanned enhancements.
4. Do not plan to implement these optional items in the current schedule:
   multi-tenant build selection (`FR-1.7`), minified/zip builds (`FR-1.8`),
   iframe tracking (`FR-2.7`), pre-ready event buffering (`FR-2.8`), and
   tab-created events/window-closing detail (`FR-5.4`). List them in the final
   README's Known issues unless the mentor changes priorities.
