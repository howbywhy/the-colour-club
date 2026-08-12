# TCC V2 — Phase 03 Code Audit

Date: 2026-08-12 · Subject: modular `index.html` + `src/`

## Top fragilities (found → status)

1. **Lock release via duplicated `setTimeout` arithmetic** — mitigated: `withLock` + try/catch on filter path; watchdog retained; durations from `TIMING`.
2. **`fly` / `flyCrop` completion** — fixed: `animation.finished` + cleanup on reject; ghost always removed.
3. **`applyHash` delayed `setDepth` by `D(500)`** — fixed: quiet depth apply is immediate.
4. **`scrollLedger.js` unused** — fixed: Info freeze/restore + `saveViewScroll` / `resetModeY` wired.
5. **Missing project-ID guards** — fixed: `openProject` / `lateral` / caps buttons guard unknown IDs.
6. **Filter leave `fill:'forwards'`** — mitigated: enter path clears opacity via `finished`; leave still fill-forwards until apply clears.

## State

- Single `world` object remains the source of truth; body classes render it.
- DOM tile `visibility:hidden` during inspect is intentional presentation.

## Routing

- `expectHash` ignores self-writes.
- Quiet ops lock-exempt.
- Idea deep-links reconstruct depth immediately.

## Transitions / lock

- Open / view / lateral use `withLock` (sync throw → release).
- Flight callbacks still release on completion; `finished` guarantees ghost cleanup.
- Watchdog 1500ms via `TIMING.watchdog`.

## Extraction order (do not execute yet)

1. `motion/timing.js` + flight (done as thin modules)
2. `routing.js` — move `syncHash` / `applyHash` with injected deps
3. `ProjectMedia` / hero geometry helpers
4. `Index` preview
5. `ProjectStack` / lateral
6. `Collection` filter sequence
7. Chrome wiring last (highest coupling)

## Dead / duplicate

- No speculative deletion performed.
- Component stubs retained as ownership markers.
- CDN `onerror` fallback retained intentionally.
- Inventory backup JSON retained.

## Filter stabilisation (post Phase 03)

Root cause of jump: filter FLIP used per-tile stagger delay with default `fill:none`, so survivors painted at destination before invert; leave used `fill:forwards` across mutate; release was wall-clock; rapid clicks were dropped while locked.

Fixed via `transitionFilter` coordinator: leave → mutate → survivor FLIP (0 stagger) + enter fade; completion via `Promise.allSettled`; latest-intent-wins cancellation; opacity committed in CSS before animation cancel.


| Token | Before | After |
|---|---|---|
| `--page-edge` | 24px | 17px |
| `#colgrid` gap | 40px 16px | 28px 10px |
| `#collectionIntro` mb / col gap | 40px / 16px | 28px / 10px |
| `.tile .lbl` padding-top | 5px | 3px |
| `.ins-gal` gap / margin-top | 16px / 16px | 10px / 10px |
| `.x #linecell` padding-bottom | 22px | 16px |
