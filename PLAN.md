#  Trailmark Project Schedule and Execution Plan


---

## 1. 10-Day Implementation Roadmap

| Day | Milestone | Objective | Verifiable Working Deliverable |
|---|---|---|---|
| **Days 1–2** | **Milestone 1** | Architecture, Design & Plan | Approved `DESIGN.md` and `PLAN.md`. Project repository initialized with `.gitignore` and structure. |
| **Day 3** | **Milestone 2A** | Build System & Configuration Engine | `npm run build` generates valid `dist/` folder with `manifest.json` from `trailmark.config.json`. Domain format validation fails clearly on invalid domains. |
| **Day 4** | **Milestone 2B** | Collector Server & Test Harness | `npm run collector` starts server at `http://localhost:4317`. `POST /events` validates payloads. Web dashboard shows events. `GET /test` serves test harness page. |
| **Day 5** | **Milestone 2C** | Page Tracking (Content Script) | Extension loads in Chrome. Navigating test page sends `tmPageView`. Clicking buttons sends `tmClick`. Password field interactions are 100% ignored. |
| **Day 6** | **Milestone 2D** *(Day 6 Mentor Checkpoint)* | Tab Tracking & Dwell Time Engine | Switching tabs dispatches `tmTabActivated` with dwell times. Closing tabs sends `tmTabClosed`. Non-allowed tabs send `restricted: true`. Dwell persists across worker sleep. |
| **Day 7** | **Milestone 3A** | Event Pipeline & Resilience | Full end-to-end integration: `installId` generated and stored in `chrome.storage.local`. Worker safely handles collector downtime without crashing. Scroll & typing burst tracking functional. |
| **Day 8** | **Milestone 3B** | Extension Popup & Tenant Overrides | Toolbar popup displays active domain, validates 22-char key format, and saves custom domain site keys that override default config keys. |
| **Day 9** | **Milestone 3C** | Unit Test Suite & Edge Cases | `npm test` runs full suite without browser. Tests verify hostname parsing, dwell math, debouncing, rapid switches (<300ms), and privacy scrubbing. Extension reload handled cleanly. |
| **Day 10** | **Milestone 4** | Documentation, Polish & Demo Dry Run | `README.md` completed with "What Trailmark collects" table and pasted test output. Clean git history verified. Live demo rehearsed against the script. |



.
