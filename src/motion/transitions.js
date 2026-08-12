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
 * - <16px snap; large survivor moves FLIP (distance-scaled duration)
 * - zero-survivor pairs: leave ghosts + immediate set swap (no blank field)
 * - mobile fade-only
 * - first interaction cancels intro
 */
export { TIMING } from './timing.js';
export { fly, flyCrop, flipTiles } from './flip.js';
export { RM, D } from '../state/worldState.js';

export const FILTER_BASELINE_NOTES = [
  'leave-primary hierarchy',
  'latest intent wins',
  'promise completion (watchdog backstop only)',
  'no stagger',
  'statement excluded',
  'survivors remain visible',
  'quieter filterEase',
  '<16px snap; large survivor moves FLIP',
  'zero-survivor leave ghosts (no blank field)',
  'mobile fade-only',
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

/** Cancel first-entry intro animations so filters/open aren't fighting opacity:0. */
export function endIntro() {
  if (!document.body.classList.contains('intro')) return;
  document.body.classList.remove('intro');
  document.querySelectorAll('.tile,#linecell h1,#chrome,#linecell .sig,#ixnote').forEach((el) => {
    try {
      el.getAnimations?.().forEach((a) => a.cancel());
    } catch (_) {}
    if (el.style && el.style.opacity === '0') el.style.opacity = '';
  });
}
