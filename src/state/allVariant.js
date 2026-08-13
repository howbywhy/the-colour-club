/**
 * Authored All layout variants — session-stable, QA-forceable.
 * Only affects Visual All (not Sector / Index).
 */
import { world } from './worldState.js';

const KEY = 'tccAllV';
const COUNT = 4;

function clampV(n) {
  const v = parseInt(n, 10);
  if (v >= 1 && v <= COUNT) return v;
  return null;
}

/** Resolve variant before first paint / boot. Persists for the browsing session. */
export function initAllVariant() {
  let forced = null;
  try {
    const q = new URLSearchParams(location.search).get('allv');
    forced = clampV(q);
  } catch (_) {}

  let v = forced;
  if (v == null) {
    try {
      v = clampV(sessionStorage.getItem(KEY));
    } catch (_) {}
  }
  if (v == null) {
    v = 1 + ((Math.random() * COUNT) | 0);
  }
  applyAllVariant(v, true);
  return v;
}

export function applyAllVariant(n, persist) {
  const v = clampV(n) || 1;
  world.allVariant = v;
  document.body.dataset.allV = String(v);
  if (persist) {
    try {
      sessionStorage.setItem(KEY, String(v));
    } catch (_) {}
  }
  return v;
}

/** QA: force variant for this session. */
export function setAllVariant(n) {
  return applyAllVariant(n, true);
}

export { COUNT as ALL_VARIANT_COUNT };
