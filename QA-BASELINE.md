# TCC V2 — QA Baseline (Monolith Reference)

**Reference:** `tcc-v2-stable.html` (immutable) + `reference/tcc-v2-stable.html`  
**Server:** `python3 -m http.server 8000` → `http://127.0.0.1:8000/tcc-v2-stable.html`  
**Date:** 2026-08-12  
**Method:** Manual-intent matrix exercised via headless Chrome (puppeteer-core) against the live local server; Close hit-testing via `elementFromPoint`.

---

## Static verification (STEP 03)

| Check | Result |
|---|---|
| `node verify.mjs tcc-v2-stable.html` | **All checks passed** |
| JS syntax (`node --check` on extracted script) | **OK** |
| `projects.json` JSON parse | **OK** |
| Duplicate project IDs | **OK** (10 unique) |
| CAPS → project refs | **OK** |
| HTML structure (intro / gallery / inspect / info / stack) | **OK** |
| Local assets under `public/images` | **0 present / 157 missing** (CDN `onerror` fallback — expected pre-collect) |

---

## A — QA SUMMARY

| Status | Count |
|---|---|
| **PASS** | 48 |
| **FAIL** | 2 |
| **PARTIAL** | 6 |

### By suite

| Suite | Result |
|---|---|
| A Initial entry | PASS |
| B Collection filters | PASS |
| C Visual / Index | PASS |
| D Index preview | PASS (portrait) / PARTIAL (no sq/land/deep covers in harvest) |
| E Project open / close | PASS (API) / **FAIL** (`#insClose` hit target) |
| F Project Images | PASS (microsoft video N/A) |
| G Images / Idea memory | **FAIL** (Idea restore) / PASS (Images + DOPA Images) |
| H Info memory | PASS |
| I Sibling stack | PASS |
| J Lateral transition | PASS (portrait / flyCrop) / PARTIAL (no land/sq covers) |
| K History | PASS |
| L Rapid input | PASS |

---

## B — BUG LIST

### BUG-01 — High — Project Close control not clickable

- **Severity:** High  
- **Exact reproduction:** Open any project → click the visible “Close” control at top-right (`#insClose`).  
- **Expected:** Project closes.  
- **Observed:** Click hits `mailto:hi@thecolourclub.com.au` in `#chrome .right` instead. `elementFromPoint` confirms. Chrome `z-index:400` > `#insClose` `z-index:240`. Escape / programmatic `closeProject()` still work.  
- **Likely cause:** Stacking order — Close sits under chrome’s right cluster.  
- **File/function:** CSS `#insClose` / `#chrome` in `tcc-v2-stable.html`  
- **Minimum proposed fix:** Raise `#insClose` above chrome (`z-index: 410`) without changing layout.

### BUG-02 — High — Idea scroll memory restores to 0

- **Severity:** High  
- **Exact reproduction:** Open SUB:3 → Images scroll deep → Idea → scroll Idea → Images → Idea.  
- **Expected:** Idea returns to previous Idea `scrollTop`.  
- **Observed:** Images memory OK (`1200→1200`). Idea saves correctly in `ledger.modeY.idea` (e.g. `384`) but visible scroll ends at `0`. Probe: immediately after `setDepth('idea')` restore, `#story` has not yet expanded (`scrollHeight` still tiny / transitional), so `scrollTop` clamps to 0; later layout expands with scroll stuck at 0.  
- **Likely cause:** `setDepth` writes `ins.scrollTop` before Idea typographic layout has height (`#story` 0fr→1fr).  
- **File/function:** `setDepth` in `tcc-v2-stable.html`  
- **Minimum proposed fix:** After applying `.idea`, restore `scrollTop` on double-rAF + short post-layout timeout (or `transitionend` on `#story`), without changing durations of the visual transition.

### Related (Medium, same stacking family)

- `#infoClose` is similarly under the chrome mailto; chrome `#infoBtn` (“Close”) and scrim click still dismiss Info. Fix optionally via `body.info #chrome .right { pointer-events:none }` or raising panel close affordance — not required for Info memory PASS.

---

## C — ARCHITECTURAL RISKS (not bugs)

1. **Layout settles as images decode** — no intrinsic width/height in data; classification/ceilings apply after load (handoff known limitation).  
2. **`openProject` uses `fly` (uniform-ish scale) not `flyCrop`** — lateral path is crop-aware; open-from-tile is a different flight. Current covers are all ~0.8 so open flight showed no rubber-sheet in probe; still a fragility if ratios diverge.  
3. **Quiet `applyHash` uses `setTimeout(..., D(500))` before `setDepth`** — works, but depth trails hash briefly on deep Idea links.  
4. **All 10 cover assets measure ~0.8 portrait** — Index preview matrix cannot exercise square/landscape/deep until harvest diversity exists. Portrait natural-ratio preview PASSes.  
5. **Vidzflow iframes** — present with `pointer-events:none`; source MP4s still unresolved (handoff).  
6. **Index scroll distance** — short filtered Index may not scroll; Info restore still correct at `y=0`.

---

## Fix log

| When | Change | Re-test |
|---|---|---|
| 2026-08-12 | BUG-01 `#insClose` z-index `240→410` in `tcc-v2-dev.html` (reference untouched) | Close hit-test **PASS**; real click closes project |
| 2026-08-12 | BUG-02 `setDepth` restores Idea `scrollTop` after layout (rAF + fallback) in `tcc-v2-dev.html` | SUB:3 Idea memory **PASS** (`385→385`); Images memory still OK; filter statement + dopa close regression **PASS** |

**Critical/High bugs remaining:** 0 (on `tcc-v2-dev.html`)

---

## Notes

- Development copy for fixes must **not** edit the immutable reference at `reference/tcc-v2-stable.html`.  
- Working file for bugfixes before modularisation: root `tcc-v2-stable.html` remains the handoff artifact; per migration plan, fixes land in a **development copy** then modular build. Decision for this session: keep `reference/` pristine; apply minimum fixes to a `tcc-v2-dev.html` (or modular tree) and leave root reference byte-identical to `reference/` if already copied.

**Checksum at session start:** `0ad6065a28cfecc675f97b189b856832967a6145` — root and `reference/` identical.

## MODULAR + LOCAL ASSET BASELINE

**Date/time:** 2026-08-12 17:41 AEST  
**Subject:** `http://127.0.0.1:8000/index.html` (modular forward line)  
**Browser:** Chrome headless via puppeteer-core  
**Viewport:** 1440×900  
**Reference:** `tcc-v2-stable.html` untouched  

### Asset counts

| Kind | Local | Remote fallback | Missing / unresolved |
|---|---:|---:|---:|
| Images | **157** | **0** | **0** |
| Videos | **1** (Gella MP4) | **0** file-fallback | **5** Vidzflow embeds (no local MP4) |

### Console

- Uncaught JS errors: **0** (during matrix)
- Unhandled rejections: **0**
- Noise: favicon.ico 404 (no favicon in repo)
- Vidzflow stream `ERR_ABORTED` when leaving a project mid-fetch — expected; embeds still used

### Matrix

| Suite | Result |
|---|---|
| A Fresh entry + decode stability | PASS (layout deltaTops all 0) |
| B Filters slow + rapid | PASS |
| C Index + sort + preview intrinsics | PASS / PARTIAL (all covers ~0.8 port — no sq/land cover diversity) |
| D All projects open/close | PASS |
| E Images/Idea memory ×3 | PASS |
| F Info restore (7 contexts) | PASS |
| G Sibling stack + lateral | PASS |
| H Video (local MP4 + embeds) | PASS (headless may leave MP4 paused; muted/loop/pe OK) |
| I History + deep refresh | PASS |
| J Rapid chaos | PASS |

**Totals:** PASS **63** · FAIL **0** · PARTIAL **1**

**Critical bugs:** 0  
**High bugs:** 0  

### Known unresolved

- Six Vidzflow IDs still need `yt-dlp` or source MP4s from TCC (five used in-project as embeds; Roy archive film not in editorial sequence)
- Cover harvest is uniformly ~0.8 portrait — Index preview matrix cannot exercise square/landscape covers until harvest diversifies
- Component stubs remain; extraction deferred to next phase

### Data / dimensions

- Canonical source: `src/data/projects.json` (root `projects.json` synced copy; inventory backup at `projects.inventory.backup.json`)
- Intrinsics via `scripts/build-canonical-data.mjs` + macOS `sips`
- Runtime emits `width`/`height` attrs; applies `a-*` + hero `aspect-ratio` from recorded dims before decode

