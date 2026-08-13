/**
 * First-entry showreel → TCC → nav → world.
 * Desktop: Vidzflow landscape pr2tCO4nrU. Mobile: portrait XnXvALPAMB.
 * Skipped for deep links / RM / return visits (session).
 *
 * Interaction wiring / clock / routing must NOT depend on intro completion.
 */
import { RM, $ } from '../state/worldState.js';
import { TIMING } from './timing.js';

const SHOWREEL = {
  landscape: 'pr2tCO4nrU',
  portrait: 'XnXvALPAMB',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isDeepLink() {
  const h = location.hash || '';
  return h !== '' && h !== '#' && h !== '#/';
}

function markIntroSeen() {
  try {
    sessionStorage.setItem('tccIntro', '1');
  } catch (_) {}
}

function hasSeenIntro() {
  try {
    return !!sessionStorage.getItem('tccIntro');
  } catch (_) {
    return false;
  }
}

function vfSrc(id) {
  return `https://app.vidzflow.com/v/${id}?dq=720&ap=true&muted=true&loop=true&ctp=false&bc=%234E5FFD&controls=`;
}

function mountShowreel(reel) {
  if (!reel) return null;
  reel.innerHTML = '';
  const portrait = matchMedia('(max-width:767px)').matches;
  const id = portrait ? SHOWREEL.portrait : SHOWREEL.landscape;
  const iframe = document.createElement('iframe');
  iframe.src = vfSrc(id);
  iframe.title = 'The Colour Club showreel';
  iframe.setAttribute('allow', 'autoplay');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  reel.appendChild(iframe);
  return iframe;
}

/**
 * Force intro inactive and restore chrome/collection interactivity.
 * Idempotent — safe on skip, cancel, error, and success.
 */
export function ensureIntroInactive() {
  const body = document.body;
  body.classList.remove('intro', 'intro-tcc', 'intro-showreel');
  const stage = $('#introStage');
  const mark = $('#introMark');
  const enter = $('#introEnter');
  const reel = $('#introReel');
  const brand = $('#brandBtn');
  const chrome = $('#chrome');
  const collection = $('#collection');

  if (stage) {
    stage.hidden = true;
    stage.style.cssText = '';
    stage.setAttribute('aria-hidden', 'true');
    stage.style.pointerEvents = 'none';
  }
  if (reel) {
    reel.innerHTML = '';
    reel.style.cssText = '';
  }
  if (mark) mark.style.cssText = '';
  if (enter) {
    enter.style.cssText = '';
    enter.blur?.();
  }
  if (brand) brand.style.visibility = '';
  if (chrome) {
    chrome.style.opacity = '';
    chrome.style.transition = '';
  }
  if (collection) {
    collection.style.opacity = '';
    collection.style.transition = '';
  }
}

/** Cancel in-flight intro animations, then force inactive. */
export function endIntroFlight() {
  const els = [
    $('#introStage'),
    $('#introMark'),
    $('#introEnter'),
    $('#introReel'),
    $('#brandBtn'),
    $('#chrome'),
    $('#collection'),
  ];
  els.forEach((el) => {
    if (!el) return;
    try {
      el.getAnimations?.().forEach((a) => a.cancel());
    } catch (_) {}
  });
  ensureIntroInactive();
}

/**
 * @returns {Promise<boolean>} true if intro ran
 */
export async function playTccIntro() {
  if (RM || isDeepLink() || hasSeenIntro()) {
    markIntroSeen();
    ensureIntroInactive();
    return false;
  }

  const stage = $('#introStage');
  const mark = $('#introMark');
  const enter = $('#introEnter');
  const reel = $('#introReel');
  const brand = $('#brandBtn');
  const chrome = $('#chrome');
  const collection = $('#collection');
  if (!stage || !mark || !brand || !enter) {
    ensureIntroInactive();
    return false;
  }

  const body = document.body;
  let entered = false;
  let finished = false;

  const waitForEnter = () =>
    new Promise((resolve) => {
      const go = () => {
        if (entered) return;
        entered = true;
        cleanup();
        resolve();
      };
      const onKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      };
      const cleanup = () => {
        enter.removeEventListener('click', go);
        stage.removeEventListener('click', onStage);
        enter.removeEventListener('keydown', onKey);
      };
      const onStage = (e) => {
        if (e.target === enter || enter.contains(e.target) || e.target === stage || e.target === reel || reel?.contains(e.target)) {
          go();
        }
      };
      enter.addEventListener('click', go);
      stage.addEventListener('click', onStage);
      enter.addEventListener('keydown', onKey);
      /* Focus for keyboard */
      try {
        enter.focus({ preventScroll: true });
      } catch (_) {
        enter.focus();
      }
    });

  try {
    body.classList.add('intro-tcc', 'intro-showreel');
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    brand.style.visibility = 'hidden';
    chrome.style.opacity = '0';
    collection.style.opacity = '0';
    mountShowreel(reel);

    await waitForEnter();
    if (finished) return false;
    markIntroSeen();

    /* Outro: dim reel, fly TCC into nav */
    stage.classList.add('is-leaving');
    const from = mark.getBoundingClientRect();
    brand.style.visibility = 'hidden';
    const to = brand.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = to.width / Math.max(from.width, 1);
    const sy = to.height / Math.max(from.height, 1);
    const s = Math.min(sx, sy);

    const flightMs = TIMING.introFlight || 480;
    const flight = mark.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 1 },
      ],
      { duration: flightMs, easing: TIMING.filterEase || 'cubic-bezier(.33,0,.15,1)', fill: 'forwards' }
    );

    if (reel) {
      reel.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.round(flightMs * 0.7),
        easing: TIMING.filterEase,
        fill: 'forwards',
      });
    }

    await sleep(Math.round(flightMs * 0.42));
    chrome.style.transition = `opacity ${TIMING.introChrome || 300}ms ${TIMING.filterEase}`;
    chrome.style.opacity = '1';

    await flight.finished.catch(() => {});
    mark.style.opacity = '0';
    brand.style.visibility = '';
    stage.hidden = true;

    collection.style.transition = `opacity ${TIMING.introWorld || 320}ms ${TIMING.filterEase}`;
    collection.style.opacity = '1';
    await sleep(TIMING.introWorld || 320);
    finished = true;
    return true;
  } catch (err) {
    console.error('[tcc] intro failed', err);
    markIntroSeen();
    return false;
  } finally {
    ensureIntroInactive();
  }
}

export { isDeepLink, SHOWREEL };
