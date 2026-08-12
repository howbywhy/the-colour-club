import { world, $ } from './worldState.js';

export function saveViewScroll() {
  world.ledger[world.view + 'Y'] = scrollY;
}

export function resetModeY() {
  world.ledger.modeY = { images: 0, idea: 0 };
}

export function freezeForInfo() {
  world.ledger.infoWinY = scrollY;
  world.ledger.infoInsTop = $('#inspect').scrollTop;
}

export function restoreAfterInfo() {
  const wy = world.ledger.infoWinY, it = world.ledger.infoInsTop;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (typeof wy === 'number' && Math.abs(scrollY - wy) > 1) scrollTo(0, wy);
    const ins = $('#inspect');
    if (typeof it === 'number' && Math.abs(ins.scrollTop - it) > 1) ins.scrollTop = it;
  }));
}
