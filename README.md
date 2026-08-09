# Marketplace Labs

Electron desktop app for a local marketplace product catalog (AliExpress / Temu folders + SQLite).

## Setup

```powershell
cd K:\Cursor\marketplace-labs
npm install
npx playwright install chromium
npm run dev
```

## Config

Paths live in [`config.yaml`](config.yaml) (relative by default):

- `output.market_root` — data root
- `output.catalog_db` — SQLite catalog
- `browser.market_profile_dir` — Playwright Chromium profile

Relative paths resolve to the project root in `npm run dev`, and to Electron `userData` in a packaged build. Absolute paths are used as-is. For a machine-specific override that must not ship in `dist`, use gitignored `config.local.yaml` (same shape as `config.yaml`).

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite hot reload |
| `npm run build` | Compile to `out/` |
| `npm run dist` | Windows installer/portable |
| `npm run typecheck` | Typecheck main/preload and renderer |
| `npm run test:smoke` | Offline smoke checks against local DB/config |

## Layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for where to put new code (marketplace split, short files, folder map).

- `src/main/app` — Electron entry + window
- `src/main/ipc` — IPC registration and handlers
- `src/main/browser` — Playwright browser + login gate
- `src/main/scrape` — product scrape orchestration; platform code in `scrape/<platform>/`
- `src/main/media` — `ml-media://` protocol for local product photos
- `src/main/db` — SQLite schema + models
- `src/main/code` — DB read/write (products, orders, tags)
- `src/main/core` — connect, paths, migrate
- `src/main/products` — list/get/update, gallery, on-disk product files
- `src/main/jobs` — job / download logging
- `src/preload` — IPC bridge
- `src/renderer/src/pages` — Import + Catalog pages
- `src/renderer/src/components` — shared UI widgets
- `src/shared/types` — shared TypeScript types
- `data/` — product folders + catalog DB (created at runtime)

Agent backlogs: [docs/bugs-to-fix.md](docs/bugs-to-fix.md), [docs/features-later.md](docs/features-later.md).

Temu product scrape is implemented; AliExpress scrape and order scrape are still TBD.
