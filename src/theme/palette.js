/**
 * Shared TCC colour system — one palette for outline, favicon, accents.
 * (Colour-flash intro removed — showreel entry owns first paint.)
 */
export const TCC_BLUE = '#4E5FFD';

export const TCC_HUES = [
  '#4E5FFD',
  '#E23A2E',
  '#0F8A46',
  '#F0740A',
  '#C4258F',
  '#7E30D8',
  '#0F7E93',
];

/** Advancing cursor through the club palette. */
export function createHueCursor(seed = 0) {
  let i = seed % TCC_HUES.length;
  return () => {
    const c = TCC_HUES[i % TCC_HUES.length];
    i += 1;
    return c;
  };
}
