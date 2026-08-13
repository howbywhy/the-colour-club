/**
 * Authored All layouts for the full 15-project library.
 * Scale identity (S3 M4 L5 XL6–7 WALL12) + controlled row rhythms.
 * Applied as inline grid placement when Visual + All (not filtered).
 *
 * Coordinates: [colStart, colEnd, row] — 12-col desktop.
 * Tablet (≤1179 / 6-col) uses compact() mapping.
 */

/** @typedef {[number, number, number]} Cell */

/** V1 — baseline authored composition */
const V1 = {
  sub3: [9, 13, 1],
  dopa: [1, 5, 2],
  fishfish: [5, 10, 2],
  roy: [10, 13, 2],
  gella: [1, 4, 3],
  lucky: [4, 8, 3],
  macabalm: [8, 13, 3],
  rgh: [1, 5, 4],
  willing: [5, 10, 4],
  worthy: [10, 13, 4],
  mesa: [1, 6, 5],
  adela: [6, 10, 5],
  aogc: [10, 13, 5],
  tsukiyo: [1, 7, 6],
  microsoft: [1, 13, 7],
};

/** V2 — opener left; lower band mirrored */
const V2 = {
  sub3: [1, 5, 1],
  dopa: [1, 5, 2],
  fishfish: [5, 10, 2],
  roy: [10, 13, 2],
  gella: [1, 4, 3],
  lucky: [4, 8, 3],
  macabalm: [8, 13, 3],
  rgh: [8, 13, 4],
  willing: [1, 6, 4],
  worthy: [6, 9, 4],
  mesa: [1, 5, 5],
  adela: [5, 9, 5],
  aogc: [9, 13, 5],
  tsukiyo: [6, 13, 6],
  microsoft: [1, 13, 7],
};

/** V3 — airier mid band */
const V3 = {
  sub3: [9, 13, 1],
  dopa: [1, 5, 2],
  fishfish: [6, 11, 2],
  roy: [10, 13, 3],
  gella: [1, 4, 3],
  lucky: [1, 5, 4],
  macabalm: [5, 10, 4],
  rgh: [1, 5, 5],
  willing: [5, 10, 5],
  worthy: [10, 13, 5],
  mesa: [1, 6, 6],
  adela: [6, 11, 6],
  aogc: [1, 4, 7],
  tsukiyo: [4, 11, 7],
  microsoft: [1, 13, 8],
};

/** V4 — centred opener */
const V4 = {
  sub3: [5, 9, 1],
  dopa: [1, 5, 2],
  fishfish: [5, 10, 2],
  roy: [10, 13, 2],
  macabalm: [1, 6, 3],
  lucky: [6, 10, 3],
  gella: [10, 13, 3],
  rgh: [1, 5, 4],
  willing: [5, 10, 4],
  worthy: [10, 13, 4],
  mesa: [1, 6, 5],
  adela: [6, 10, 5],
  aogc: [10, 13, 5],
  tsukiyo: [6, 13, 6],
  microsoft: [1, 13, 7],
};

export const ALL_LAYOUTS = { 1: V1, 2: V2, 3: V3, 4: V4 };

/** Map 12-col authored cell → 6-col tablet cell. */
export function compactCell([a, b, r]) {
  const map = (c) => Math.max(1, Math.min(7, Math.round(((c - 1) * 6) / 12) + 1));
  let s = map(a);
  let e = map(b);
  if (e <= s) e = Math.min(7, s + 1);
  /* wall / full-bleed stays full */
  if (b - a >= 11) {
    s = 1;
    e = 7;
  }
  return [s, e, r];
}

/**
 * Apply authored All geometry to tile nodes (Visual + unfiltered only).
 * Clears placement when filtered / Index.
 */
export function applyAllLayout(grid, variant = 1) {
  const layout = ALL_LAYOUTS[variant] || ALL_LAYOUTS[1];
  const narrow = matchMedia('(max-width:1179px)').matches;
  const mobile = matchMedia('(max-width:767px)').matches;
  const filtered = document.body.classList.contains('filtered');
  const index = document.body.classList.contains('x');

  grid.querySelectorAll('.tile').forEach((t) => {
    if (filtered || index || mobile) {
      t.style.gridColumn = '';
      t.style.gridRow = '';
      return;
    }
    const cell = layout[t.dataset.id];
    if (!cell) {
      t.style.gridColumn = '';
      t.style.gridRow = '';
      return;
    }
    const [a, b, r] = narrow ? compactCell(cell) : cell;
    t.style.gridColumn = `${a} / ${b}`;
    t.style.gridRow = String(r);
  });
}

export function clearAllLayout(grid) {
  grid.querySelectorAll('.tile').forEach((t) => {
    t.style.gridColumn = '';
    t.style.gridRow = '';
  });
}
