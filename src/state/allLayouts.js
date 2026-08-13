/**
 * Authored All layouts for the full 23-project live library.
 * Scale identity retained (S3 M4 L5 XL6–7 WALL12); arrangement varies by session variant.
 * Applied as inline grid placement when Visual + All (not filtered).
 *
 * Coordinates: [colStart, colEnd, row] — 12-col desktop.
 * Tablet (≤1179 / 6-col) uses compact() mapping.
 */

/** @typedef {[number, number, number]} Cell */

/**
 * V1 — baseline: live-index rhythm, opener right, wall closer.
 * Landscape/wall reserved for microsoft; portraits stay contained.
 */
const V1 = {
  sub3: [9, 13, 1],
  mochi: [1, 4, 2],
  dopa: [4, 8, 2],
  rads: [8, 13, 2],
  gella: [1, 4, 3],
  icedtea: [4, 8, 3],
  macabalm: [8, 13, 3],
  fishfish: [1, 6, 4],
  yammy: [6, 10, 4],
  kingbrown: [10, 13, 4],
  roy: [1, 4, 5],
  tsukiyo: [4, 9, 5],
  willing: [9, 13, 5],
  lucky: [1, 5, 6],
  rare: [5, 9, 6],
  rgh: [9, 13, 6],
  test: [1, 4, 7],
  mesa: [4, 9, 7],
  adela: [9, 13, 7],
  worthy: [1, 4, 8],
  nido: [4, 8, 8],
  aogc: [8, 13, 8],
  microsoft: [1, 13, 9],
};

/** V2 — opener left; lower band mirrored */
const V2 = {
  sub3: [1, 5, 1],
  mochi: [5, 9, 2],
  dopa: [1, 5, 2],
  rads: [9, 13, 2],
  gella: [1, 4, 3],
  icedtea: [4, 8, 3],
  macabalm: [8, 13, 3],
  fishfish: [6, 11, 4],
  yammy: [1, 5, 4],
  kingbrown: [11, 13, 4],
  roy: [1, 4, 5],
  tsukiyo: [4, 10, 5],
  willing: [10, 13, 5],
  lucky: [9, 13, 6],
  rare: [1, 5, 6],
  rgh: [5, 9, 6],
  test: [10, 13, 7],
  mesa: [1, 6, 7],
  adela: [6, 10, 7],
  worthy: [10, 13, 8],
  nido: [1, 5, 8],
  aogc: [5, 10, 8],
  microsoft: [1, 13, 9],
};

/** V3 — airier mid band; quieter right seats */
const V3 = {
  sub3: [9, 13, 1],
  mochi: [1, 4, 2],
  dopa: [4, 8, 2],
  rads: [1, 6, 3],
  gella: [6, 10, 3],
  icedtea: [10, 13, 3],
  macabalm: [1, 5, 4],
  fishfish: [5, 10, 4],
  yammy: [10, 13, 4],
  kingbrown: [1, 4, 5],
  roy: [4, 8, 5],
  tsukiyo: [8, 13, 5],
  willing: [1, 5, 6],
  lucky: [5, 9, 6],
  rare: [9, 13, 6],
  rgh: [1, 5, 7],
  test: [5, 9, 7],
  mesa: [9, 13, 7],
  adela: [1, 6, 8],
  worthy: [6, 10, 8],
  nido: [10, 13, 8],
  aogc: [1, 5, 9],
  microsoft: [1, 13, 10],
};

/** V4 — centred opener; denser upper, calmer lower */
const V4 = {
  sub3: [5, 9, 1],
  mochi: [1, 4, 2],
  dopa: [4, 8, 2],
  rads: [8, 13, 2],
  gella: [1, 4, 3],
  icedtea: [4, 8, 3],
  macabalm: [8, 13, 3],
  fishfish: [1, 6, 4],
  yammy: [6, 10, 4],
  kingbrown: [10, 13, 4],
  roy: [1, 4, 5],
  tsukiyo: [4, 9, 5],
  willing: [9, 13, 5],
  lucky: [1, 5, 6],
  rare: [5, 9, 6],
  rgh: [9, 13, 6],
  test: [1, 4, 7],
  mesa: [4, 8, 7],
  adela: [8, 13, 7],
  worthy: [1, 4, 8],
  nido: [4, 8, 8],
  aogc: [8, 13, 8],
  microsoft: [1, 13, 9],
};

export const ALL_LAYOUTS = { 1: V1, 2: V2, 3: V3, 4: V4 };

/** Map 12-col authored cell → 6-col tablet cell. */
export function compactCell([a, b, r]) {
  const map = (c) => Math.max(1, Math.min(7, Math.round(((c - 1) * 6) / 12) + 1));
  let s = map(a);
  let e = map(b);
  if (e <= s) e = Math.min(7, s + 1);
  /* Keep Visual tiles above thumbnail scale on 6-col — right-edge S3 was collapsing to 1 col. */
  const srcSpan = b - a;
  if (srcSpan >= 3 && e - s < 2) {
    e = Math.min(7, s + 2);
    if (e - s < 2) s = Math.max(1, e - 2);
  }
  if (srcSpan >= 5 && e - s < 3) {
    e = Math.min(7, s + 3);
    if (e - s < 3) s = Math.max(1, e - 3);
  }
  if (srcSpan >= 11) {
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
      t.classList.remove('is-wall');
      return;
    }
    const cell = layout[t.dataset.id];
    if (!cell) {
      t.style.gridColumn = '';
      t.style.gridRow = '';
      t.classList.remove('is-wall');
      return;
    }
    const [a, b, r] = narrow ? compactCell(cell) : cell;
    t.style.gridColumn = `${a} / ${b}`;
    t.style.gridRow = String(r);
    t.classList.toggle('is-wall', b - a >= 10);
  });
}

export function clearAllLayout(grid) {
  grid.querySelectorAll('.tile').forEach((t) => {
    t.style.gridColumn = '';
    t.style.gridRow = '';
    t.classList.remove('is-wall');
  });
}
