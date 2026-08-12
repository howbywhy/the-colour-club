# TCC V2 — Phase 04 Responsive QA

**Build:** modular `index.html` + `src/`  
**Date:** 2026-08-12  
**Harness:** `.qa-tools/qa-responsive.mjs`

## Totals

| Status | Count |
|---|---|
| **PASS** | 215 |
| **FAIL** | 0 |
| **PARTIAL** | 0 |

Critical / High: **0**

## Filter feel (desktop 1440)

| Check | Result |
|---|---|
| Large row-collapses snap (no FLIP choreography) | PASS — 6 large survivor moves snapped |
| Tiny corrections not animated | PASS |
| Statement unmoved | PASS (top 84) |
| Leave-primary / quieter ease | Applied (`filterEase`, shorter leave/enter) |

## Per viewport

| Viewport | Collection | Filters | Index | Project | Idea | Info | Lateral | Video | History | Overflow | Touch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 375×667 | PASS | PASS | PASS | PASS | PASS | PASS | PASS (rail) | PASS | PASS | PASS | PASS |
| 390×844 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 430×932 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 768×1024 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | — |
| 1024×768 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | — |
| 1180×800 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | — |
| 1440×900 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | — |

## Orientation

390 portrait → 844×390 landscape: **PASS** (project / depth / sector / lock preserved; no overflow).

## Architecture notes

| Surface | Mobile behaviour |
|---|---|
| Chrome | TCC · Visual/Index · scrollable filters · Info; clock/email demoted |
| Collection | Sequential flex field; ratio width ceilings retained |
| Index | 2-col stacked rows; hover preview disabled |
| Project stack | Bottom horizontal 3:5 rail |
| Idea | Linear beat stack |
| Info | Near full-screen sheet |
| Viewport meta | `width=device-width, initial-scale=1` |

## Breakpoints

- Tablet: `max-width: 1179px`
- Mobile: `max-width: 767px`
- Touch hit areas: `(hover: none), (pointer: coarse)`

## Console

No app errors in matrix (favicon ignored).
