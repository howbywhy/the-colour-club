# TCC V2 — Stable Behavioural Baseline

Handoff for the GitHub / Cursor / Vercel migration. `tcc-v2-stable.html` is the
verified single-file baseline. **No further feature work happens in the monolith.**

## Site concept

One collection, multiple readings. The positioning statement is architecture;
the gallery is content. Two collection readings (Visual / Index), two project
readings (Images / Idea), one overlay (Info). Colour points at work — a seven-hue
session deck advances on every work-pointing hover (field tiles, sibling stack,
Index preview, Info proof links) and appears nowhere else. At rest the site is
quiet; interaction reveals colour.

## State model (single source of truth: `world`)

```
world = {
  sector:   'all' | 'hospitality' | 'fmcg' | 'spatial',
  view:     'field' | 'index',
  selected: project id | null,
  depth:    'images' | 'idea',
  infoOpen: boolean,
  sort:     Index sort key | null,
  ledger: {
    fieldY, indexY,          // collection scroll per view
    slot,                    // tile to return to on close
    modeY: {images, idea},   // per-project-visit mode scroll (reset on open/lateral)
    infoWinY, infoInsTop,    // world frozen beneath Info
  },
  lock:     transition guard (see Lock hygiene),
  last:     debug label,
}
```

DOM classes (`g/x`, `proj`, `filtered`, `fhide`, `idea`, `info`, `locked`)
**render** world state; they are never read back as state.

## Route model

```
#/                      field, all
#/index                 index, all
#/<sector>              field, filtered
#/index/<sector>        index, filtered
#/p/<id>                project Images
#/p/<id>/idea           project Idea
…any of the above + /info   (Info layer over that state; '#/info' at root)
```

Reconciliation rules: the router writes hashes via `syncHash` and records the
exact value in `expectHash`; a `hashchange` matching it is ignored (self-write).
External changes (Back/Forward, refresh, pasted URL) reconcile through the same
state functions **with `quiet=true`, which is instant and lock-exempt** — router
operations never animate, so they can never race a running transition or each
other. Refresh reconstructs any deep state once.

## Collection / filter logic

- The statement lives in `#collectionIntro`, a 12-column grid mirroring the
  gallery's gutters (statement at columns 1–9). It is structurally incapable of
  participating in filtering: never measured, never FLIPped, never moved.
- `#galleryField > #colgrid` holds only project tiles with authored explicit
  `grid-column` placements. Filtering toggles `.fhide` (display:none); grid row
  auto-placement closes gaps **vertically only**; horizontal positions are the
  authored ones in every state. One exception: Microsoft, authored 1/13 as the
  full wall's closing gesture, holds `1/7` as a filtered survivor.
- Filter motion (minimum version): label confirms synchronously → leavers fade
  160ms → single mutate → survivors FLIP vertically (320ms, 12ms stagger, cap
  60ms) → enterers fade in at their authored destination (200ms, 80ms delay).
  No detaching, no fixed positioning, no z-index management.

## Project Images / Idea logic

- `Images` = chrome caption + full-width hero (aspect set from the source
  image's intrinsic dimensions before the FLIP target is measured) + media
  sequence. `Idea` = typographic composition (lede at the large size + placed
  beats + deliverables/credits), hero and gallery hidden.
- Mode is preserved across lateral navigation (Idea → next project opens Idea).
- **Scroll memory:** `ledger.modeY` stores each mode's scrollTop for the current
  project visit. Switching modes saves the outgoing and restores the incoming
  (0 on first visit). Opening a project or moving laterally resets both.
  `scrollTop = 0` is only ever written on first entry to a mode.
- Info freezes whichever mode is visible (`infoInsTop`) plus the window scroll
  (`infoWinY`) and restores both on close via double-rAF.

## Image-ratio rules

- Primary presentation is never cropped. `width:100%; height:auto` everywhere
  except sanctioned navigation crops: sibling stack thumbs (36×60 = 3:5), Index
  row thumbs (36×60 = 3:5), and the hero img inside its truth-ratio frame.
- Runtime classification by intrinsic ratio: `a-land` >1.15, `a-sq` 0.85–1.15,
  `a-port` <0.85, `a-deep` <0.62 (3:5 ≈ 0.6 → deep).
- Span ceilings (gallery): sq ≤5 cols, port ≤4, deep ≤3; landscape keeps the
  authored rhythm including full width. Hero spans: land 1/13, sq 1/8, port 1/6,
  deep 1/5. Intrinsic max-widths on top: sq 640 / port 560 / deep 440 (hero 680
  / 560 / 460). Landscape has no ceiling.
- Index hover preview: natural shape scaled into max 380px × 62vh — ratio always
  wins; reveal only after dimensions are known (no default-geometry flash);
  stale-load guard for rapid row-hopping.
- Lateral flight is crop-aware: a clipped container tweens rects while the image
  keeps intrinsic proportions under a moving cover-crop. Nothing rubber-sheets.

## Video rules

Passive presentation media only: vidzflow iframes (autoplay, muted, loop, no
controls) and one native MP4 (GellaFrenda, local-first with Dropbox fallback).
All gallery media carries `pointer-events:none` so scroll passes through.
A future controlled-video need is a different component mode — documented, not
built. Ordering: `vids[{at,…}]` interleaves motion at its editorial position.

## Colour interaction rule

`HUES` = ['#4E5FFD','#E23A2E','#0F8A46','#F0740A','#C4258F','#7E30D8','#0F7E93'].
One session counter; advances once per pointer-entry on any work-pointing
element; colour chosen at entry, stable for that hover; 120ms appearance.
Colour is reinforcement, never the sole affordance. Nothing else is coloured.

## Transition principles

Every interaction has one dominant visual event. Router reconciliation is
instant. FLIP for ownership (tile ↔ hero, field ↔ index), fades for
presence, vertical settlement for filtering. The statement never animates.
First-entry intro (statement → chrome → work, ~1.3s) is presentational only:
sessionStorage-gated, skipped for deep links and reduced motion, never replays
on internal returns.

## Lock hygiene

All animated transitions run through `acquire()` / `release()`; a 1.5s watchdog
guarantees the lock always frees even if an animation errors. Quiet (router)
operations bypass the lock entirely because they are synchronous.

## Bugs found and fixed in this pass

1. **Critical — filter leaver corruption.** R15's detach choreography cleaned
   inline styles by regexing `style.cssText`; browsers re-serialise cssText with
   different spacing, so cleanup silently failed, leaving tiles stuck as
   invisible fixed-position elements and re-entering at stale coordinates.
   Fixed by deleting the detach choreography (minimum filter version).
2. **High — router/lock collisions.** Back from a project to a filtered view, or
   refresh on `#/index/<sector>`, made sequential reconciliation calls that the
   transition lock rejected, diverging URL and state. Fixed: quiet ops are
   instant and lock-exempt.
3. **High — stale depth enum.** `openProject`'s completion callback still wrote
   `world.depth='inspect'` (pre-R08 naming), so the first Images→Idea switch
   filed the Images scroll under a dead key and the return restored 0. Fixed to
   `'images'`.
4. **Medium — statement/gallery coupling.** Statement was measured in every
   filter FLIP and defended by a seat guard. Fixed structurally; guard deleted.
5. **Medium — lock leakage.** Lock release depended on hand-matched timeout
   constants; any animation failure locked the site permanently. Fixed with
   acquire/release + watchdog.

## Known limitations / unresolved

- **Browser verification has NOT been performed.** The build sandbox has no
  rendering engine; everything above is verified by static analysis, state
  simulation and `scripts/verify.mjs` (83 checks, all passing). The full manual
  test matrix from the stabilisation brief is the acceptance checklist for the
  first Cursor session — run it before trusting this baseline.
- One deliberate visual change from the separation: the statement and SUB:3 no
  longer share a row. The statement band sits above the gallery; SUB:3 opens
  gallery row 1 at columns 9–13. Review optically; if the pairing matters, it
  should be recomposed inside the gallery, not by re-coupling the statement.
- Layout settles as images load (heights unknown until decode). Fix in the
  repo: record intrinsic `width/height` into `projects.json` during collection
  and emit them as attributes.
- Index-mode statement size change snaps (it no longer FLIPs as a tile).

## Remaining assets needed

- Six vidzflow source MP4s (via `yt-dlp` block in `collect-assets.sh` on an
  open network, or from Nick): `XrKxaeFOEC`, `AtrFBhQc0V` (SUB:3),
  `xQb7BhNBtq` (DOPA), `azlhVm1ZZb` (Fish Fish), `nAo7fzfRJ2`, `8PoNqcgfZC`
  (Our Boy Roy).
- Harvests for the remaining 12 archive projects (only 7 + 3 legacy sets done).
- Real TCC typeface (stand-in Familjen Grotesk behind `--sans`; one-line swap).
- Nick to verify: sector taxonomy, capability→proof mapping, 12 missing
  straplines, credits.
