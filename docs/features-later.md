# Features later

Future work backlog for agents. Not bugs — intentional follow-ups after the early architecture settles.

When an item is done: remove its section (or move a short note into git history / ARCHITECTURE if the decision changes policy).
When we decide never to do it: delete the section and, if useful, record the reason in [ARCHITECTURE.md](../ARCHITECTURE.md) or [bugs-wont-fix.md](bugs-wont-fix.md).

---

## F1 — Revisit Temu / AliExpress code sharing

**When:** After both marketplaces are implemented and the early architecture has settled — **not now**.

**Where:** Platform modules under `src/main/browser/auth/` and `src/main/scrape/{temu,aliexpress}/` (plus any near-identical helpers that accumulated). Policy today: [ARCHITECTURE.md](../ARCHITECTURE.md) (Marketplace split).

**What:** Review duplicated Temu vs AliExpress code (auth, scrape steps, fetch/helpers that look the same) and **decide** whether to merge any pieces or keep them separate permanently.

**Why later:** We intentionally duplicate today. High-level workflow may look similar (URL → auth → scrape → disk → DB), but Temu and AliExpress differ in practice. Premature shared fetch/parsers would hide real differences while the app is still early.

**Direction:**

- Keep routers dispatch-only (`browser/marketAuth.ts`, `scrape/product.ts`).
- Only extract shared code if concrete identical behavior is proven after both sides exist.
- Do **not** merge by default. Separate folders remain valid forever if platforms stay different.
