/**
 * Info — panel presentation + open/close intent.
 * Scroll freeze/restore owned by scrollLedger (not here).
 */
import { world, D, $ } from '../state/worldState.js';
import { TIMING, endIntro } from '../motion/transitions.js';
import { freezeForInfo, restoreAfterInfo } from '../state/scrollLedger.js';

export function createInfo({ syncHash, onDbg }) {
  function openInfo(quiet) {
    if (world.infoOpen) return;
    if (!quiet) endIntro();
    world.infoOpen = true;
    world.last = 'info:open';
    freezeForInfo();
    document.body.classList.add('info');
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
    document.body.classList.remove('info');
    $('#infoBtn').textContent = 'Info';
    restoreAfterInfo();
    if (!quiet) syncHash();
    onDbg && onDbg();
    then && setTimeout(then, D(TIMING.infoThen));
  }

  function bindInfoChrome() {
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
