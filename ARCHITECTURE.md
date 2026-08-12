# TCC V2 — Architecture

Baseline: `c707620` (responsive) + `d058ae3` (4:5 nav thumbs).  
Pre-extraction behavioural lock. No remotes.

## Principles

- **One world state** (`src/state/worldState.js`) — DOM classes render it; they are not truth.
- **Routing** translates URL ↔ intended world state; it does not own animation.
- **Motion** owns transitions, timing, locks, completion.
- **Scroll ledger** owns scroll memory / Info freeze.
- **Data** (`src/data/projects.json`) is canonical content.
- **Responsive** = presentation only; same state/routes.
- Navigation thumbnails = **4:5 crop** (`--nav-thumb-w/h`). Primary media = natural ratio.

## Ownership map

| Concern | Owner module | Notes |
|---|---|---|
| Boot / wire | `src/main.js` | Initialise → connect systems |
| World state + lock | `src/state/worldState.js` | Single source of truth |
| Scroll ledger | `src/state/scrollLedger.js` | Visual/Index/Images/Idea/Info freeze |
| Routing | `src/state/routing.js` | Hash parse/write, deep links, expectHash |
| Timing / ease | `src/motion/timing.js` | Includes filter perceptual thresholds |
| FLIP / flight | `src/motion/flip.js` | fly, flyCrop, flipTiles |
| Motion façade | `src/motion/transitions.js` | Re-exports + filter baseline notes |
| Project media | `src/components/ProjectMedia.js` | Paths, dims, ratios, video/embed |
| Collection + filters | `src/components/Collection.js` | Statement, tiles, filter coordinator |
| Index | `src/components/Index.js` | Rows, 4:5 thumbs, sort, hover preview |
| Project stack | `src/components/ProjectStack.js` | Desktop vertical / mobile rail 4:5 |
| Project view | `src/components/ProjectView.js` | Open/close/lateral/depth orchestration |
| Idea | `src/components/IdeaView.js` | Presentation owned with ProjectView |
| Info | `src/components/Info.js` | Panel presentation + open/close intent |
| Chrome | `src/components/Chrome.js` | Renders world; not a second state machine |
| CSS | `src/styles/tcc.css` | May split later; values locked |

## Filter baseline (perceptual — preserve)

- Leave-primary hierarchy; latest intent wins; promise completion
- No stagger; statement excluded; survivors do not fade
- Quieter `filterEase`; &lt;16px snap; **&gt;240px snap** (perceptual decision to review later, not architectural)
- Mobile fade-only; first interaction cancels intro

## Dependencies (acyclic)

```
data → worldState
timing → (none)
flip → worldState, timing
scrollLedger → worldState
routing → worldState (+ action callbacks from main)
ProjectMedia → data helpers
Collection / Index / Stack / Info / Chrome → worldState, media, motion callbacks
main → all (wires only)
```

## Scroll policy

Every `scrollTop = 0` / `scrollTo(0,…)` must be intentional:

| Location | Reason |
|---|---|
| Project open (`main.js`) | Start Images at top |
| Lateral (`main.js`) | New project starts at top of current mode |
| Brand → field (`Chrome.js`) | Explicit return-to-club |
| Filter scroll restore (`Collection.js`) | Undo accidental drift during transition |
| Info restore (`scrollLedger.js`) | Resume frozen underlying scroll |

## QA hooks

`window.world` and transition helpers remain for local QA. Production behaviour must not require them.
