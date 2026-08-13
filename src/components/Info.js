/**
 * Info — panel presentation + open/close intent.
 * Scroll freeze/restore owned by scrollLedger (not here).
 *
 * While open, Info is the exclusive interaction layer (INFO > PROJECT > COLLECTION).
 * Underlying UI is inert — preserved, not destroyed.
 */
import { world, D, $ } from '../state/worldState.js';
import { TIMING, endIntro } from '../motion/transitions.js';
import { freezeForInfo, restoreAfterInfo } from '../state/scrollLedger.js';

/** Underlying surfaces that must not receive pointer / focus while Info owns the layer. */
const UNDERLYING_SELECTORS = [
  '#collection',
  '#inspect',
  '#stack',
  '#insClose',
  '#brandBtn',
  '#pchrome',
  '#modeCtl',
  '#viewBtn',
  '#filters',
  '#chrome .chrome-utilities',
  '#introStage',
];

export function createInfo({ syncHash, onDbg }) {
  let focusBeforeInfo = null;
  let scrollBlockBound = false;

  /** Block wheel/touch scroll on everything except the Info panel itself. */
  function blockUnderlyingScroll(e) {
    if (!world.infoOpen) return;
    const t = e.target;
    if (t && t.closest && t.closest('#info')) return;
    e.preventDefault();
  }

  function bindScrollBlock() {
    if (scrollBlockBound) return;
    scrollBlockBound = true;
    const opts = { capture: true, passive: false };
    addEventListener('wheel', blockUnderlyingScroll, opts);
    addEventListener('touchmove', blockUnderlyingScroll, opts);
  }

  function setInfoExclusive(active) {
    UNDERLYING_SELECTORS.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (active) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });

    const info = $('#info');
    const scrim = $('#infoScrim');
    if (info) {
      info.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active) info.setAttribute('aria-modal', 'true');
      else info.removeAttribute('aria-modal');
    }
    if (scrim) scrim.setAttribute('aria-hidden', active ? 'false' : 'true');

    if (active) {
      focusBeforeInfo = document.activeElement;
      const close = $('#infoClose');
      if (close && typeof close.focus === 'function') {
        requestAnimationFrame(() => close.focus({ preventScroll: true }));
      }
    } else if (focusBeforeInfo && typeof focusBeforeInfo.focus === 'function') {
      const restore = focusBeforeInfo;
      focusBeforeInfo = null;
      requestAnimationFrame(() => {
        try {
          restore.focus({ preventScroll: true });
        } catch (_) {
          /* node may have been removed */
        }
      });
    } else {
      focusBeforeInfo = null;
    }
  }

  function openInfo(quiet) {
    if (world.infoOpen) return;
    if (!quiet) endIntro();
    world.infoOpen = true;
    world.last = 'info:open';
    freezeForInfo();
    document.body.classList.add('info');
    setInfoExclusive(true);
    $('#infoBtn').textContent = 'Close';
    if (!quiet) syncHash();
    onDbg && onDbg();
  }

  function closeInfo(then, quiet) {
    if (!world.infoOpen) {
      then && then();
      return;
    }
    world.infoOpen = false;
    world.last = 'info:close';
    setInfoExclusive(false);
    document.body.classList.remove('info');
    $('#infoBtn').textContent = 'Info';
    restoreAfterInfo();
    if (!quiet) syncHash();
    onDbg && onDbg();
    then && setTimeout(then, D(TIMING.infoThen));
  }

  function bindInfoChrome() {
    bindScrollBlock();
    $('#infoBtn').addEventListener('click', () => (world.infoOpen ? closeInfo() : openInfo()));
    $('#infoClose').addEventListener('click', () => closeInfo());
    $('#infoScrim').addEventListener('click', () => closeInfo());
  }

  /** Capability proof list inside Info panel. */
  function buildCaps(capsData, getById, nextHue, onOpenProject) {
    const caps = $('#caps');
    capsData.forEach(([n, ids]) => {
      const d = document.createElement('div');
      d.className = 'capgrp';
      const byId = getById();
      d.innerHTML = `<div class="cn">${n}</div><div class="proof">${ids
        .filter((i) => byId[i])
        .map((i) => `<button data-open="${i}">${byId[i].name}</button>`)
        .join('')}</div>`;
      caps.appendChild(d);
      d.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => b.style.setProperty('--hue', nextHue())));
    });
    caps.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      closeInfo(() => onOpenProject(b.dataset.open));
    });
  }

  return { openInfo, closeInfo, bindInfoChrome, buildCaps };
}
