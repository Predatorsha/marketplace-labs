# Bugs to fix

Список багов, которые нужно починить. Подробности — для агента.

Source: defect review in the StarRatingDisplay / Temu scrape chat.
Already fixed elsewhere — do **not** re-open (and do not put them in `docs/bugs-wont-fix.md`):

- Temu login short-circuit on “Welcome back” / “Hello, …” (`src/main/browser/auth/temu.ts`) — fixed.
- Gallery loop pushing duplicates when preview does not advance (`src/main/scrape/temu/gallery.ts`) — fixed (`prevKey` check).
- Import “Open folder” relative path (`shell.ts` + `fromRelativeFolder`) — fixed.
- Folder-key product lookup vs cwd (`products/load.ts`) — fixed.
- Relative `market_root` / `catalog_db` via `resolveAppPath` / `dataRoot` (`paths.ts`, `config.ts`) — fixed.
- Packaged app shipping developer-absolute `config.yaml` — fixed (portable `config.yaml` + gitignored `config.local.yaml`).

When a bug is fixed: remove its section from this file.
When we decide not to fix a bug: move its section to `docs/bugs-wont-fix.md` (with a short reason).

Priorities: **P1** user/data breakers, **P2** wrong data or unfinished wiring, **P3** low impact.

---

## P1

### P1-4 — `parseMoney` treats `0.xxx` (3 fraction digits) as thousands

**Where:** `src/main/code/orders.ts` — `normalizeNumericToken` (~31–32), used by `parseMoney` (~37–50), order line upserts (~171–174).

**What:** Rule “1–3 digits before separator + exactly 3 after ⇒ thousands” turns `0.999` → `999`, `0,123` → `123`. Common decimal prices with three places become wildly wrong `unit_price` once order sync is wired.

**Fix direction:** Do not apply thousands grouping when the integer part is `0`, or tighten the heuristic (e.g. require thousands only for values that look like `1.234` / `12.345` with locale rules). Add a few unit cases.

---

## P2

### P2-1 — Re-scrape always forces `status = 'active'`

**Where:** `src/main/code/products.ts` — `upsertProductFromSaved` passes `status: 'active'` (~476); `upsertProductRecord` writes `status = ?` without COALESCE (~252).

**What:** Re-downloading an archived product silently un-archives it.

**Fix direction:** Preserve existing status on update unless explicitly set; only default `'active'` on insert.

---

### P2-2 — Re-scrape wipes specs/images on partial success

**Where:** `src/main/code/products.ts` — `setProductSpecs` / `setProductImages` DELETE-then-insert (~103–126); always called from upsert (~478–479).

**What:** A re-scrape that gets title/price but empty specs (details not expanded) or zero successful image downloads replaces prior child rows with nothing — catalog data loss even when scrape “ok”.

**Fix direction:** Skip child replace when new payload is empty; or merge/COALESCE; or only replace when scrape collected non-empty children.

---

### P2-3 — Single-image Temu products get no Catalog cover

**Where:** `src/main/scrape/temu/product.ts` (~71–77): last gallery frame → choice, rest → `images/`. With one URL, `gallery_image_urls` empty. Cover: `src/main/products/list.ts` (~73–77) only via `product_images` / `images/`, not `choices/`.

**What:** Product with one photo has a saved choice image but Catalog `cover_url` is null → “No photo” card.

**Fix direction:** Fall back cover to choice image path when `images/` empty.

---

### P2-4 — `resolveGoodsId` ignores path `g-{id}` — DONE

**Where:** was `src/main/scrape/temu/product.ts` — `resolveGoodsId`; `src/main/scrape/url.ts` — `extractTemuGoodsId`.

**Resolution:** Temu id is taken once from original URL pathname (`-g-{digits}`) in `parseProductUrl`. `resolveGoodsId` removed; scrape always uses `opts.productId` (disk/DB unchanged). Query / fallback extractors deleted.

---

### P2-5 — Archiving a product does not remove it from Catalog

**Where:** `src/main/products/list.ts` (~38–42) — `SELECT` all products, no `WHERE status = 'active'`. UI can set `status: 'archived'` via detail panels + `updateProduct`.

**What:** Archived items stay on the grid and remain openable; archive has no catalog effect.

**Fix direction:** Filter list (and counts) to active unless UI adds an “archived” view.

---

### P2-6 — Order-sync stub products appear as broken Catalog cards

**Where:** `src/main/code/orders.ts` — `upsertOrderItem` / `upsertProductRecord` without `folder_path` (~180 area). Still listed by `listProducts`.

**What:** When order sync runs, folderless product rows show as ghost cards; click → “У товара нет папки на диске” / no cover.

**Fix direction:** Don’t list products without `folder_path` in Catalog; or mark them differently; or don’t create product rows without folders until download exists.

---

### P2-7 — Order sync unfinished; `orders:progress` never emitted

**Where:** `src/main/ipc/handlers/orders.ts` (~6–13) stub; `src/main/scrape/orders.ts` throws; upsert helpers in `code/orders.ts` unused. Preload/App listen for `orders:progress`; main never `webContents.send('orders:progress', …)`. Product scrape calls `ensureTemuLoggedIn(page)` without progress wiring.

**What:** Orders UI cannot sync; progress channel is dead.

**Fix direction:** Wire scrape → `applyOrderSyncPayload`; emit progress from jobs/auth; remove stub when ready. Until then, keep UI honest about stub.

---

### P2-8 — Market auth guard is a no-op

**Where:** `src/main/browser/marketAuth.ts` (~36–38); installed from `src/main/browser/manager.ts` (~219–223). Comment implies AliExpress navigations should open login gate. Only explicit `ensureTemuLoggedIn` (product scrape) gates today.

**What:** Orders, mall tab, future AE navigations get no automatic auth HumanGate.

**Fix direction:** Call `ensurePlatformLoggedIn` on relevant navigations, or implement a real guard; update comments if intentional.

---

### P2-9 — Browser quit / close not coordinated with scrape jobs

**Where:** `src/main/app/index.ts` (~31–33) — `before-quit` → `void shutdownBrowser()` without await. `BrowserManager.close()` / `restart()` use `startChain`; jobs use `jobChain` (`manager.ts` ~102–109, ~266–275). Persistent-context liveness: `context.browser()` is null so disconnected-browser check never fires (~165–167).

**What:** Quit can tear down Chromium mid-scrape / skip profile flush; half-dead context can be reused until ops fail.

**Fix direction:** Await shutdown on quit path; serialize close with job lock; fix liveness for persistent context.

---

### P2-10 — Half-star ratings break via React `useId` in SVG

**Where:** `src/renderer/src/components/StarRatingDisplay.tsx` (~92, 108–109, 53–59).

**What:** `useId()` yields ids like `:r0:`. `fill={url(#:r0:-half-0)}` is invalid/misparsed → half fills don’t paint. Full/empty still work; fractional marketplace ratings look wrong in Catalog and detail.

**Fix direction:** Sanitize id (`replace(/:/g, '')`) or avoid `url(#)` gradients (clipPath / two overlapping paths).

---

### P2-11 — Product URLs without a scheme are rejected

**Where:** `src/main/scrape/url.ts` (~50–55).

**What:** `new URL(trimmed)` requires a scheme. Pastes like `www.temu.com/...-g-123.html` throw `invalid product url` even though host/id are parseable after prepending `https://`.

**Fix direction:** If no scheme, prepend `https://` then parse.

---

### P2-12 — Multi-package orders never link `package_items`

**Where:** `src/main/code/orders.ts` (~502–514).

**What:** Orders with more than one package link `package_orders` but skip `package_items` mapping → packages detached from line items.

**Fix direction:** Map items into packages for the multi-package branch the same as single-package (once sync is live).

---

### P2-13 — Product update can persist `folder_path = NULL`

**Where:** `src/main/products/update.ts` (~129).

**What:** `folderRel = toRelativeFolder(cfg, folderAbs)` written with no null check. If conversion fails, SQLite stores `NULL`, then trailing `getProduct` fails with “no folder” — row corrupted after Save. Also rewrites `folder_path` even when patch didn’t intend relink.

**Fix direction:** Abort update if `toRelativeFolder` returns null; don’t touch `folder_path` unless folder actually changes.

---

### P2-14 — Review count alone shows an empty rating row

**Where:** `src/renderer/src/components/ProductDetailPanels.tsx` (~213–221); `StarRatingDisplay` returns null when `parseRating` fails (`StarRatingDisplay.tsx` ~93–94).

**What:** Parent renders `info-rating-row` when `rating || review_count`, but child returns null if rating missing/invalid → empty row.

**Fix direction:** Gate parent on parseable rating, or teach display to show count-only.

---

## P3

### P3-1 — Nested HumanGate reuses old payload / no rebroadcast

**Where:** `src/main/browser/humanGate.ts` (~79–89).

**What:** Second `openHumanGate` while one active shares existing `gateId`/promise; new `kind`/`message` dropped; no new `orders:humanGate` event. UI stays on first gate copy.

**Fix direction:** Reject nested gates, or update payload and re-emit.

---

### P3-2 — Unknown `orders:start` platform coerced to AliExpress

**Where:** `src/main/ipc/handlers/orders.ts` (~7–11).

**What:** Non-`temu`/`aliexpress` becomes response `platform: 'aliexpress'`, so bad/missing platform is misreported.

**Fix direction:** Fail closed or return `platform: 'unknown'`.

---

### P3-3 — Save fails silently on invalid pack / empty folder

**Where:** `src/renderer/src/components/ProductDetailPanels.tsx` (~163).

**What:** `saveEdit` bare-`return`s when pack isn’t finite or folder empty — no status/error. User clicks Save, nothing happens.

**Fix direction:** Surface a short error in the existing status UI.

---

### P3-4 — README references missing `test:smoke` script

**Where:** `README.md` (~30) vs `package.json` scripts.

**What:** Docs advertise `npm run test:smoke`; script does not exist.

**Fix direction:** Add script or remove/fix README line.

---

### P3-5 — `platformFromUrl` scans full URL string, Temu first

**Where:** `src/main/browser/marketAuth.ts` (~9–13).

**What:** Named `host` but uses full `page.url()` lowercased. Path/query containing `"temu"` classifies as Temu before AliExpress. Harmless while `ensurePlatformLoggedIn` is barely used; wrong if revived.

**Fix direction:** Parse hostname only; order checks carefully.

---

### P3-6 — Numeric label vs star glyphs disagree (0.25 / 0.75 thresholds)

**Where:** `src/renderer/src/components/StarRatingDisplay.tsx` — `starKinds` (~19–27).

**What:** Label shows rounded tenth (e.g. `4,7`) while stars use ≥0.75 full, ≥0.25 half. `4,7` → four full + half (~4.5 look); `3,2` → three full only. Intentional threshold design can still confuse users next to the number.

**Fix direction:** Align thresholds with displayed tenth (e.g. half at ≥0.3 / full at ≥0.8) or document as intentional and leave.

---

## Notes for the fixing agent

- Prefer minimal diffs; match existing style.
- Path bugs (P1-1, P1-2, P1-3, P2-13) are one cluster — fix together if touching `paths.ts` / folder helpers.
- Orders items (P1-4, P2-6, P2-7, P2-12, P3-2) can wait until order sync is real, except P1-4 if you want the parser safe early.
- After each fix: remove the section here. If skipped on purpose: move it to `docs/bugs-wont-fix.md`.
