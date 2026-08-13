/**
 * Motion façade — timing, flight, FLIP, reduced-motion helpers.
 * Do not retune behaviour during extraction.
 *
 * Filter perceptual baseline (orchestration lives with Collection later):
 * - leave-primary hierarchy
 * - latest intent wins
 * - promise completion (watchdog backstop only)
 * - no stagger
 * - statement excluded
 * - survivors remain visible
 * - quieter filterEase
 * - Visual: subtract / restore / substitute; residual FLIP only
 * - survivors never fade; no ghosts; no milky dual fields
 * - Index: rows opacity only; fixed shell; no FLIP
 * - mobile Visual: fade-only (no FLIP)
 * - first interaction cancels intro
 */
import { endIntroFlight } from './intro.js';

export { TIMING } from './timing.js';
export { fly, flyCrop, flipTiles } from './flip.js';
export { RM, D } from '../state/worldState.js';

export const FILTER_BASELINE_NOTES = [
  'leave-primary hierarchy',
  'latest intent wins',
  'promise completion (watchdog backstop only)',
  'no stagger',
  'statement excluded',
  'survivors remain visible (opacity 1)',
  'quieter filterEase',
  'Visual: All authored ↔ Sector persistent 6-slot canvas; All→Sector = SECTOR_SETTLE only; sector→sector = slot handoff',
  'Index: shell fixed; rows opacity only',
  'mobile Visual: ordered sector slots; no whole-field fade',
  'first interaction cancels intro',
];

/** QA-patchable flight table so window.fly / window.flyCrop stay lexical. */
export function createFlightTable(flyRaw, flyCropRaw) {
  const flights = { fly: flyRaw, flyCrop: flyCropRaw };
  return {
    flights,
    fly: (...a) => flights.fly(...a),
    flyCrop: (...a) => flights.flyCrop(...a),
  };
}

/** Cancel WAAPI on elements and clear opacity/transform inline styles. */
export function cancelElementAnims(els) {
  [...els].forEach((t) => {
    t.getAnimations?.().forEach((a) => {
      try {
        a.cancel();
      } catch (_) {}
    });
    if (t.style) {
      t.style.opacity = '';
      t.style.transform = '';
    }
  });
}

/** Cancel first-entry intro so filters/open aren't fighting opacity:0. */
export function endIntro() {
  if (
    !document.body.classList.contains('intro') &&
    !document.body.classList.contains('intro-tcc') &&
    !document.body.classList.contains('intro-showreel')
  ) {
    return;
  }
  endIntroFlight();
}
