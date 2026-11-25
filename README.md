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

The project is in the design stage (Milestone 1). Setup, build, test and
collector instructions, the "What Trailmark collects" table, and Known issues
will be added here as the code is written (see `PLAN.md`).
