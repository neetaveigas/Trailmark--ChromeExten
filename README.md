# Trailmark--ChromeExten
Manifest V3 Chrome extension and local Node collector tracking clicks, tab switches, and dwell time locally without recording typed or read content.

## Repositories

Trailmark is split across two repositories:

| Repository | What it contains |
| --- | --- |
| [Trailmark--ChromeExten](https://github.com/neetaveigas/Trailmark--ChromeExten) (this one) | The Chrome extension, its build script and tests, and the design and plan (`DESIGN.md`, `PLAN.md`) |
| [trailmark-collector](https://github.com/neetaveigas/trailmark-collector) | The local Node collector at `http://localhost:4317`: receives events, shows them on a dashboard, and serves the manual test page |

The event format they share is the contract in [DESIGN.md section 4](DESIGN.md#4-event-contract-between-the-two-repositories).

## Getting both repositories

Clone them side by side in the same parent folder, so this repository's
`npm run collector` can find the collector:

```sh
git clone https://github.com/neetaveigas/Trailmark--ChromeExten.git
git clone https://github.com/neetaveigas/trailmark-collector.git
```

## Build and test

Requirements: Node 18 or newer. There are no packages to install.

```sh
npm run build    # creates dist/ from trailmark.config.json and manifest.template.json
npm test         # runs the extension tests with Node's built-in test runner
```

Load `dist/` in Chrome at `chrome://extensions`: turn on **Developer mode**,
click **Load unpacked**, and choose the `dist` folder.

**Settings (`trailmark.config.json`):** `name`, `description`, `version`,
`siteKey` (exactly 22 letters, numbers, `_` or `-`) and `allowedDomains`.
Each `allowedDomains` entry is one of:

| Entry | Meaning |
| --- | --- |
| `example.com` | That hostname only |
| `*.example.com` | `example.com` and all its subdomains |
| `*` (as `["*"]`, the only entry) | Every website |

Anything else (a scheme, a path, a port, a `*` anywhere else, an empty entry,
uppercase letters) stops the build with an error naming the entry. The build
always gives the extension access to the collector at
`http://localhost:4317`.

The tracking features, the "What Trailmark collects" table, and Known issues
are added here as the code is written (see `PLAN.md`).
