/**
 * First-entry: WHITE + BLACK TCC → showreel fades under → enter
 * → showreel surface swipes down (uncovering the already-painted site)
 * while TCC flies to #brandBtn.
 *
 * First paint is static (html.intro-boot + critical CSS). JS only enhances.
 * Desktop Vidzflow: pr2tCO4nrU. Mobile: XnXvALPAMB.
 *
 * Model: WORLD ready underneath · INTRO STAGE covers · ENTER moves sheet + TCC.
 */
import { RM, $ } from '../state/worldState.js';
import { TIMING } from './timing.js';

const SHOWREEL = {
  landscape: 'pr2tCO4nrU',
  portrait: 'XnXvALPAMB',
};

const EASE = () => TIMING.filterEase || 'cubic-bezier(.33,0,.15,1)';

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

function clearBootClass() {
  document.documentElement.classList.remove('intro-boot');
}

/**
 * Force intro inactive and restore interactivity.
 * Idempotent — safe on skip, cancel, error, and success.
 */
export function ensureIntroInactive() {
  const body = document.body;
  body.classList.remove('intro', 'intro-tcc', 'intro-showreel', 'intro-chrome-on');
  clearBootClass();
  const stage = $('#introStage');
  const mark = $('#introMark');
  const enter = $('#introEnter');
  const reel = $('#introReel');
  const surface = $('#introSurface');
  const brand = $('#brandBtn');
  const chrome = $('#chrome');
  const collection = $('#collection');

  if (stage) {
    stage.hidden = true;
    stage.style.cssText = '';
    stage.classList.remove('is-leaving');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.pointerEvents = 'none';
  }
  if (surface) surface.style.cssText = '';
  if (reel) {
    reel.innerHTML = '';
    reel.style.cssText = '';
    reel.classList.remove('is-live');
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
    chrome.querySelectorAll('.ctr, .chrome-utilities').forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.transition = '';
    });
  }
  if (collection) {
    collection.style.opacity = '';
    collection.style.transition = '';
    collection.style.pointerEvents = '';
  }
}

/** Cancel in-flight intro animations, then force inactive. */
export function endIntroFlight() {
  const els = [
    $('#introStage'),
    $('#introSurface'),
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
  markIntroSeen();
  ensureIntroInactive();
}

function mountShowreel(reel) {
  if (!reel) return null;
  reel.innerHTML = '';
  reel.classList.remove('is-live');
  reel.style.opacity = '0';
  const portrait = matchMedia('(max-width:767px)').matches;
  const id = portrait ? SHOWREEL.portrait : SHOWREEL.landscape;
  const iframe = document.createElement('iframe');
  iframe.src = vfSrc(id);
  iframe.title = 'The Colour Club showreel';
  iframe.setAttribute('allow', 'autoplay; fullscreen');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.setAttribute('allowfullscreen', '');
  reel.appendChild(iframe);
  return iframe;
}

/**
 * Prefer iframe `load` + double rAF so the player has painted once.
 * Fallback timeout is a safety valve only — never the first-paint strategy.
 */
function awaitReelReady(iframe, abortState) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ready) => {
      if (done) return;
      done = true;
      resolve(ready && !abortState.aborted);
    };
    if (!iframe) {
      finish(false);
      return;
    }
    iframe.addEventListener(
      'load',
      () => {
        requestAnimationFrame(() => requestAnimationFrame(() => finish(true)));
      },
      { once: true }
    );
    setTimeout(() => finish(true), 4000);
  });
}

function waitForEnter(stage, enter, reel) {
  return new Promise((resolve) => {
    let entered = false;
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
    const onStage = (e) => {
      if (
        e.target === enter ||
        enter.contains(e.target) ||
        e.target === stage ||
        e.target === reel ||
        reel?.contains(e.target)
      ) {
        go();
      }
    };
    const cleanup = () => {
      enter.removeEventListener('click', go);
      stage.removeEventListener('click', onStage);
      enter.removeEventListener('keydown', onKey);
    };
    enter.addEventListener('click', go);
    stage.addEventListener('click', onStage);
    enter.addEventListener('keydown', onKey);
    try {
      enter.focus({ preventScroll: true });
    } catch (_) {
      enter.focus();
    }
  });
}

/** Eager-decode first-viewport covers so the swipe never exposes grey placeholders. */
function prepareFirstViewportMedia() {
  const tiles = [...document.querySelectorAll('#colgrid > .tile')].slice(0, 10);
  tiles.forEach((t) => {
    const img = t.querySelector('.ph img');
    if (!img) return;
    if (img.loading === 'lazy') img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
    try {
      img.decode?.().catch(() => {});
    } catch (_) {}
  });
}

function worldReadyForEnter() {
  const brand = $('#brandBtn');
  const line = $('#linecell h1');
  const tiles = [...document.querySelectorAll('#colgrid > .tile')];
  const first = tiles.slice(0, 4);
  const brandOk = !!brand && brand.getBoundingClientRect().width > 0;
  const lineOk = !!line && line.getBoundingClientRect().height > 0;
  const tilesOk =
    tiles.length > 0 &&
    first.every((t) => {
      const r = t.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
  return brandOk && lineOk && tilesOk;
}

/** Shared-object TCC → #brandBtn, concurrent with surface swipe-down (unless RM). */
async function runExit({ stage, surface, mark, brand, reduced }) {
  markIntroSeen();
  const body = document.body;
  stage.classList.add('is-leaving');
  /* Stage must not paint a white sheet — only #introSurface covers the world */
  stage.style.background = 'transparent';

  /* Neutralise optical offset so FLIP maths use layout boxes */
  mark.style.transform = 'none';
  void mark.offsetWidth;

  const from = mark.getBoundingClientRect();
  brand.style.visibility = 'hidden';
  const to = brand.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const sx = to.width / Math.max(from.width, 1);
  const sy = to.height / Math.max(from.height, 1);
  const s = Math.min(sx, sy);
  const ease = EASE();

  if (reduced) {
    mark.style.opacity = '0';
    brand.style.visibility = '';
    body.classList.add('intro-chrome-on');
    stage.hidden = true;
    clearBootClass();
    return;
  }

  const swipeMs = TIMING.introSwipe || 620;
  const flightMs = TIMING.introFlight || 560;
  const chromeAt = TIMING.introChrome || 300;

  const swipe = surface
    ? surface.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(100vh)' }],
        { duration: swipeMs, easing: ease, fill: 'forwards' }
      )
    : null;

  await sleep(TIMING.introBreath || 80);

  const flight = mark.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 1 },
    ],
    { duration: flightMs, easing: ease, fill: 'forwards' }
  );

  /* Secondary chrome resolves while TCC approaches — one group, not staggered items */
  const chromeTimer = setTimeout(() => {
    body.classList.add('intro-chrome-on');
  }, chromeAt);

  await Promise.all([flight.finished.catch(() => {}), swipe?.finished.catch(() => {})]);
  clearTimeout(chromeTimer);
  body.classList.add('intro-chrome-on');

  mark.style.opacity = '0';
  brand.style.visibility = '';
  stage.hidden = true;
  clearBootClass();
}

/**
 * @returns {Promise<boolean>} true if intro ran
 */
export async function playTccIntro() {
  if (isDeepLink() || hasSeenIntro()) {
    markIntroSeen();
    ensureIntroInactive();
    return false;
  }

  const stage = $('#introStage');
  const mark = $('#introMark');
  const enter = $('#introEnter');
  const reel = $('#introReel');
  const surface = $('#introSurface');
  const brand = $('#brandBtn');
  if (!stage || !mark || !brand || !enter) {
    ensureIntroInactive();
    return false;
  }

  const body = document.body;
  const abortState = { aborted: false };
  const abortReveal = () => {
    abortState.aborted = true;
  };

  try {
    body.classList.add('intro-tcc', 'intro-showreel');
    body.classList.remove('intro-chrome-on');
    document.documentElement.classList.add('intro-boot');
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    brand.style.visibility = 'hidden';

    /* World must already be final underneath before the visitor clicks */
    prepareFirstViewportMedia();
    if (!worldReadyForEnter()) {
      await sleep(0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      prepareFirstViewportMedia();
    }

    /* Reduced motion: white + TCC; enter → immediate handoff (no swipe / video) */
    if (RM) {
      await waitForEnter(stage, enter, reel);
      await runExit({ stage, surface, mark, brand, reduced: true });
      return true;
    }

    const enterPromise = waitForEnter(stage, enter, reel);
    const hold = sleep(TIMING.introHold || 200);
    const iframe = mountShowreel(reel);
    const readyPromise = awaitReelReady(iframe, abortState);

    const first = await Promise.race([enterPromise.then(() => 'enter'), hold.then(() => 'hold')]);

    if (first === 'enter') {
      abortReveal();
      await runExit({ stage, surface, mark, brand, reduced: false });
      return true;
    }

    const revealTask = (async () => {
      const ok = await readyPromise;
      if (abortState.aborted || !ok) return;
      reel.classList.add('is-live');
      await reel
        .animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: TIMING.introVideoFade || 420,
          easing: EASE(),
          fill: 'forwards',
        })
        .finished.catch(() => {});
      if (!abortState.aborted) reel.style.opacity = '1';
    })();

    await enterPromise;
    abortReveal();
    try {
      reel.getAnimations?.().forEach((a) => a.cancel());
    } catch (_) {}

    await runExit({ stage, surface, mark, brand, reduced: false });
    await revealTask.catch(() => {});
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
