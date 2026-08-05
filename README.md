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

Paths live in [`config.yaml`](config.yaml):

- `output.market_root` — data root
- `output.catalog_db` — SQLite catalog
- `browser.market_profile_dir` — Playwright Chromium profile

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite hot reload |
| `npm run build` | Compile to `out/` |
| `npm run dist` | Windows installer/portable |
| `npm run typecheck` | Typecheck main/preload and renderer |
| `npm run test:smoke` | Offline smoke checks against local DB/config |

## Layout

- `src/main/app` — Electron entry + window
- `src/main/ipc` — IPC registration and handlers
- `src/main/browser` — Playwright browser + login gate
- `src/main/media` — `ml-media://` protocol for local product photos
- `src/main/catalog` — SQLite schema, connect helpers, repos
- `src/main/products` — list/get/update, gallery, on-disk product files
- `src/preload` — IPC bridge
- `src/renderer/src/pages` — Import + Catalog pages
- `src/renderer/src/components` — shared UI widgets
- `src/shared/types` — shared TypeScript types
- `data/` — product folders + catalog DB (created at runtime)

Product download / order scrape are not included yet (Import download returns a stub).
