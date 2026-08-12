# TCC V2 — First Cursor Migration Plan

Objective: **parity, not improvement.** The stable baseline's behaviour is the
spec. The first migration produces the same site from separated source files —
no framework, no dependencies, no design changes.

## Step 0 — before touching structure

1. Create the repo; commit `tcc-v2-stable.html`, `data/projects.json`,
   `scripts/` verbatim as the reference state.
2. Run `bash scripts/collect-assets.sh` from the repo root (open network).
   Commit `/public/images` and `/public/media`. Attempt the yt-dlp block; log
   which vidzflow films resolve.
3. **Run the full manual browser test matrix against the monolith** and record
   results — this is the missing verification step and defines "parity".
4. Extend `collect-assets.sh` (or a small follow-up script) to record each
   asset's intrinsic width/height into `projects.json`, and emit them as
   `width`/`height` attributes when rendering — kills layout settle and
   classification delay.

## Step 1 — mechanical separation (still no framework)

Split the monolith into plain ES modules + one stylesheet, served statically:

```
/src
  /components        one module per surface; each renders from world state
    Chrome           brand, project caption, mode ctl, view/filter/info ctls
    Collection       intro (statement) + gallery field wrapper
    ProjectTile      tile markup, hue advancement, classification hooks
    Index            head, sorting, hover preview
    ProjectView      inspect shell, open/close/ready states
    ProjectMedia     hero + typed media sequence (image | vidzflow | mp4)
    ProjectStack     3:5 sibling stack
    IdeaView         lede + placed beats + pmeta
    Info             panel content and layer behaviour
  /data
    projects.js      re-export of projects.json (single source)
  /state
    worldState.js    world object, acquire/release, ledger
    routing.js       syncHash/applyHash, expectHash guard, quiet reconciliation
    scrollLedger.js  fieldY/indexY/modeY/info freeze-restore
  /motion
    flip.js          flipTiles
    transitions.js   fly, flyCrop, filter sequence, durations (D, RM)
  /styles
    tcc.css          tokens (--page-edge, type scale, hues) + all rules
/public
  /images/projects/{id}/…
  /media/projects/…
index.html           shell that mounts the modules
```

Responsibilities stay exactly as in the monolith; imports replace scope.
Commit per component with the browser matrix spot-checked after each.

## Step 2 — parity sign-off

Re-run the full matrix against the modular build side-by-side with the
monolith. Differences are bugs in the migration, not opportunities.

## Explicitly deferred (do NOT do in this migration)

Next.js / React / TypeScript / Sanity / Vercel config / GSAP or any animation
library / package dependencies / responsive redesign / intro rework / Info
visual refinement / remaining 12 project harvests. Each is a separate decision
after parity is proven.
