/** World — single source of truth + transition lock. */
import { TIMING } from '../motion/timing.js';

export const world = {
  sector: 'all',
  view: 'field',
  selected: null,
  depth: 'images',
  infoOpen: false,
  sort: null,
  allVariant: 1,
  ledger: { fieldY: 0, indexY: 0, slot: null },
  lock: false,
  last: 'boot',
};

export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const D = (ms) => (RM ? 0 : ms);
export const $ = (s) => document.querySelector(s);

export function acquire() {
  world.lock = true;
  clearTimeout(world._wd);
  world._wd = setTimeout(() => { world.lock = false; }, TIMING.watchdog);
}
export function release() {
  world.lock = false;
  clearTimeout(world._wd);
}

/** Run a locked transition; always releases on sync throw (watchdog remains as backstop). */
export function withLock(label, fn) {
  if (world.lock) return false;
  acquire();
  world.last = label;
  try {
    fn();
    return true;
  } catch (err) {
    release();
    console.error('[tcc]', label, err);
    return false;
  }
}
