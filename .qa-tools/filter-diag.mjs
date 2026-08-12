/** Diagnose filter jump — read-only. */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { sessionStorage.setItem('tccIntro', '1'); } catch (e) {} });
await page.waitForSelector('#colgrid .tile');
await sleep(500);

const diag = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const stmt = () => {
    const el = document.querySelector('#collectionIntro');
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top * 10) / 10, left: Math.round(r.left * 10) / 10 };
  };
  const snap = (label) => {
    const tiles = [...document.querySelectorAll('#colgrid .tile')].map(t => {
      const r = t.getBoundingClientRect();
      const cs = getComputedStyle(t);
      const anims = t.getAnimations ? t.getAnimations() : [];
      return {
        id: t.dataset.id,
        fhide: t.classList.contains('fhide'),
        left: Math.round(r.left),
        top: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        op: cs.opacity,
        transform: cs.transform,
        styleOp: t.style.opacity,
        animN: anims.length,
        fill: anims.map(a => a.effect?.getTiming?.().fill).join(','),
      };
    });
    return {
      label,
      t: performance.now(),
      sector: world.sector,
      lock: world.lock,
      scrollY,
      stmt: stmt(),
      tiles,
    };
  };

  const events = [];
  const jumps = [];
  let prev = null;

  const tick = () => {
    const now = snap('tick');
    if (prev) {
      for (const t of now.tiles) {
        if (t.fhide) continue;
        const p = prev.tiles.find(x => x.id === t.id);
        if (!p || p.fhide) continue;
        const dL = t.left - p.left, dT = t.top - p.top;
        const hasTx = t.transform && t.transform !== 'none';
        if ((Math.abs(dL) > 6 || Math.abs(dT) > 6) && !hasTx) {
          jumps.push({
            kind: 'SNAP',
            id: t.id,
            from: { left: p.left, top: p.top, op: p.op, tx: p.transform, styleOp: p.styleOp, animN: p.animN },
            to: { left: t.left, top: t.top, op: t.op, tx: t.transform, styleOp: t.styleOp, animN: t.animN },
            dL, dT,
            lock: now.lock,
            sector: now.sector,
            dt: Math.round(now.t - prev.t),
          });
        }
        // opacity flash: survivor goes to 0 briefly
        if (parseFloat(p.op) > 0.9 && parseFloat(t.op) < 0.15 && !t.fhide) {
          jumps.push({ kind: 'FADE_FLASH', id: t.id, sector: now.sector, lock: now.lock });
        }
      }
      if (Math.abs(now.stmt.top - prev.stmt.top) > 0.4 || Math.abs(now.stmt.left - prev.stmt.left) > 0.4) {
        jumps.push({ kind: 'STMT', from: prev.stmt, to: now.stmt, sector: now.sector, lock: now.lock });
      }
    }
    prev = now;
  };

  const iv = setInterval(tick, 8);

  async function go(sec) {
    events.push(snap('before:' + sec));
    const sy0 = scrollY;
    setFilter(sec);
    await sleep(40);
    events.push(snap('t40:' + sec));
    await sleep(130);
    events.push(snap('t170:' + sec)); // around leave end / mutate
    await sleep(30);
    events.push(snap('t200:' + sec));
    await sleep(150);
    events.push(snap('t350:' + sec));
    await sleep(400);
    events.push(snap('done:' + sec));
    events.push({ label: 'scrollDelta:' + sec, dY: scrollY - sy0, scrollY });
  }

  await go('hospitality');
  await go('fmcg');
  await go('spatial');
  await go('all');

  // Rapid clicks while locked — should be ignored by current code
  const rapidAccepted = [];
  for (const sec of ['hospitality', 'fmcg', 'spatial', 'all', 'hospitality', 'fmcg', 'spatial', 'all']) {
    const before = world.sector;
    const locked = world.lock;
    setFilter(sec);
    rapidAccepted.push({ want: sec, before, locked, after: world.sector, lockNow: world.lock });
    await sleep(40);
  }
  await sleep(1500);

  clearInterval(iv);

  // Probe flipTiles measurement bug: does it measure leavers?
  // Current flipTiles measures ALL tiles including those about to be display:none
  // After mutate, leavers have width 0 so skipped — but survivors were measured WITH leavers still in flow
  // That's correct for FLIP before. The jump is: mutate happens, then AFTER measure, then animate —
  // BUT there's a frame between mutate and applying invert transform where tiles are at destination.

  // Also: fill forwards on leavers — when apply() clears opacity style and sets fhide,
  // the WAAPI fill may still paint opacity 0 on survivors that were incorrectly in leaving?
  // Or: flipTiles measures ALL tiles positions before mutate including leavers.
  // After mutate, survivors move. Invert is applied via animate() which starts NEXT frame.
  // Classic FLIP snap: one frame at final position without transform.

  return {
    jumpCount: jumps.length,
    jumps: jumps.slice(0, 50),
    byKind: jumps.reduce((a, j) => { a[j.kind] = (a[j.kind] || 0) + 1; return a; }, {}),
    stmtJumps: jumps.filter(j => j.kind === 'STMT'),
    rapidAccepted,
    keyFrames: events.filter(e => typeof e.label === 'string' && /t170:|t200:|before:|done:|scroll/.test(e.label)).map(e => {
      if (e.dY !== undefined) return e;
      return {
        label: e.label,
        sector: e.sector,
        lock: e.lock,
        scrollY: e.scrollY,
        stmt: e.stmt,
        vis: e.tiles.filter(t => !t.fhide).map(t => `${t.id}:${t.left},${t.top}|op=${t.op}|tx=${t.transform === 'none' ? '-' : 'Y'}|a${t.animN}`),
      };
    }),
  };
});

writeFileSync(join(ROOT, '.qa-tools/filter-diag.json'), JSON.stringify(diag, null, 2));
console.log('jumpCount', diag.jumpCount);
console.log('byKind', diag.byKind);
console.log('stmtJumps', diag.stmtJumps);
console.log('rapid sample', diag.rapidAccepted.slice(0, 8));
console.log('--- key frames hospitality ---');
for (const e of diag.keyFrames.filter(e => /hospitality|scrollDelta:hospitality/.test(e.label || ''))) {
  console.log(JSON.stringify(e, null, 2));
}
console.log('--- first 15 jumps ---');
console.log(JSON.stringify(diag.jumps.slice(0, 15), null, 2));
await browser.close();
