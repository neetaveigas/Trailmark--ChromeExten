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
5. Begin feature code only after the mentor has reviewed and approved both
   documents.

**Where:** 30-minute mentor call; record outcomes in `DESIGN.md` and
`PLAN.md` in the project workspace.

## 2. Build milestones (Days 3-9)

Each milestone ends with a working result that can be shown. Keep the work in
small commits and push progress to the repository at least daily.

| Day | Work and requirements | Demonstrable result |
| --- | --- | --- |
| 3 | Build pipeline and settings (`FR-1.1-1.5`), including the collector host permission on every tenant build (Issue #4); local collector and manual test page (`FR-7.1-7.3`); initial pure unit tests | `npm run build` creates a loadable `dist/` whose `host_permissions` includes `http://localhost:4317/*` even with a short `allowedDomains` list; `npm run collector` serves the static dashboard at `http://localhost:4317/` (table built in the browser from `GET /events`, Issue #5) and `/test`; valid event POST succeeds, invalid POST returns 400, and a non-JSON `Content-Type` returns 415; `npm test` runs |
| 4 | Page view/click tracking and safe message flow (`FR-2.1-2.4`, `FR-3.1-3.2`, `FR-4.1-4.4`, `NFR-1,3-5`) | A page on an allowed host produces page-view and click events in the collector; no element text/value or password data is sent; common fields are present |
| 5 | Tab activation, closing, restricted hosts, restart-safe dwell time (`FR-5.1-5.3`, `FR-5.6`), and the serial queue for tab/window state updates (Issue #3) | Switch between tabs and close one; show host-only events and dwell time; restricted pages have no hostname; tests cover dwell calculation, closing an unseen tab, and two events arriving together |
| 6 | Mentor checkpoint and resilience (`FR-3.3`, `FR-4.5`, `NFR-5,6`) | Review progress with mentor; document changes; reload the extension while a test page is open without repeated console errors; confirm operation resumes after refresh |
| 7 | Scroll and typing bursts, browser focus, and short-tab filtering (`FR-2.5-2.6`, `FR-5.5`, `FR-5.7`) | Show one grouped scroll event per completed scroll, a typing-burst event with counts only, and dwell time pausing outside Chrome; ignore tabs active for less than 300 ms; unit tests cover grouping, focus, and filtering |
| 8 | Popup and collector summaries (`FR-6.1-6.4`, `FR-7.4`); domain-setting validation (`FR-1.6`) | Save, list, and delete a per-domain site key; invalid key shows an error; events use the domain override; collector keeps running totals of all events (not just the latest 200), serves them at `GET /summary`, and the dashboard displays event counts and dwell totals |
| 9 | Stabilization and complete demo rehearsal | Run the full demo flow, required tests, and checks for privacy leaks; complete the README and list any skipped Should items as known issues |

### Day 10 - Final hand-in and demo

Run the demo on a call, show the passing `npm test` output, and confirm the
repository contains the final `DESIGN.md`, `PLAN.md`, code, and README. The
README must include setup/build/test/collector instructions, the "What Trailmark
collects" table, Known issues, and the final test output.

**Where:** Local Chrome and terminal for the demo; push final changes to the
GitHub repository and share the latest commit with the mentor.

## 3. Build order and reasons

1. **Config, build, collector, and pure helpers:** Establish the event shape and
   collector contract first. Test URL parsing and other tricky logic in Node
   before involving Chrome.
2. **Page-to-collector vertical slice:** Implement page view and click, content
   script messaging, worker validation, and collector POST. This verifies the
   main architecture early.
3. **Tab state and dwell time:** Add the most stateful behavior once event
   delivery works; persist state and unit-test calculations independently.
4. **Reload/error handling:** Exercise worker and collector failures before
   adding optional tracking, so the core demo remains dependable.
5. **Optional Should features and finish:** Add planned extras only after all
   Must requirements and their tests pass. Reserve the last build day for
   stabilization and documentation.

## 4. Testing and acceptance checks

- Run `npm test` without opening a browser. Use Node's built-in test runner.
- Test hostname parsing for `https://`, `http://`, `chrome://`, empty input,
  and random text.
- Test dwell time across tab switches, and confirm closing an unseen tab does
  not throw.
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
  - Unit tests for `addToSummary()` in `collector/summary.js`: counts per
    event type; dwell added to `previousHostname`; restricted dwell goes to
    `restrictedDwellMs`; negative, non-numeric, or missing `previousDwellMs`
    is ignored; a hostname of `__proto__` is stored as a normal entry; the
    input summary is not mutated.
  - Manually: store the malicious event, open the dashboard, and confirm the
    string is shown as text and no alert or console CSP violation from
    Trailmark code appears.
- Check serialized events contain no full URL, query string, tab title, page
  text, input value, key value, or password data.
- Add unit tests for every Should feature implemented, including pause/resume
  dwell behavior if browser blur/focus is included.
- Manually use the collector's `/test` page to try buttons, scrolling, a text
  field, and a password field. The password field must produce no event data.
- Demo: build/load `dist/`, start the collector, show page events and password
  privacy, switch/close tabs and show dwell events, run tests, and show any
  completed Should features.

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
