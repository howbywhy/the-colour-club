/** Filter stabilisation stress + snap detection. */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runAt(browser, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const consoleErr = [];
  page.on('pageerror', e => consoleErr.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { sessionStorage.setItem('tccIntro', '1'); } catch (e) {} });
  await page.waitForSelector('#colgrid .tile');
  await sleep(400);

  const report = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stmt = () => {
      const r = document.querySelector('#collectionIntro').getBoundingClientRect();
      return { top: r.top, left: r.left };
    };
    const snaps = [];
    const jumps = [];
    let prev = null;
    const tick = () => {
      const tiles = [...document.querySelectorAll('#colgrid .tile')].map(t => {
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return {
          id: t.dataset.id,
          fhide: t.classList.contains('fhide'),
          left: r.left, top: r.top,
          op: parseFloat(cs.opacity),
          tx: cs.transform,
        };
      });
      const now = {
        t: performance.now(),
        sector: world.sector,
        lock: world.lock,
        phase: filterCtrl.phase,
        scrollY,
        stmt: stmt(),
        hash: location.hash,
        tiles,
        stale: tiles.filter(t => t.fhide && t.op > 0.01 && t.tx === 'none' && false),
        invisibleLive: tiles.filter(t => !t.fhide && t.op < 0.05 && t.tx === 'none' && filterCtrl.phase === 'idle'),
      };
      if (prev) {
        if (Math.abs(now.stmt.top - prev.stmt.top) > 0.5 || Math.abs(now.stmt.left - prev.stmt.left) > 0.5) {
          jumps.push({ kind: 'STMT', from: prev.stmt, to: now.stmt, phase: now.phase });
        }
        if (Math.abs(now.scrollY - prev.scrollY) > 0) {
          jumps.push({ kind: 'SCROLL', from: prev.scrollY, to: now.scrollY, phase: now.phase });
        }
        for (const t of now.tiles) {
          if (t.fhide) continue;
          const p = prev.tiles.find(x => x.id === t.id);
          if (!p || p.fhide) continue;
          const dL = t.left - p.left, dT = t.top - p.top;
          const hasTx = t.tx && t.tx !== 'none';
          /* Snap = large move while no invert transform */
          if ((Math.abs(dL) > 6 || Math.abs(dT) > 6) && !hasTx && now.phase !== 'leaving') {
            jumps.push({ kind: 'SNAP', id: t.id, dL: Math.round(dL), dT: Math.round(dT), phase: now.phase, sector: now.sector });
          }
        }
      }
      prev = now;
    };
    const iv = setInterval(tick, 8);

    async function waitIdle(ms = 2000) {
      const start = performance.now();
      while (performance.now() - start < ms) {
        if (filterCtrl.phase === 'idle' && !world.lock) {
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          if (filterCtrl.phase === 'idle' && !world.lock) return true;
        }
        await sleep(20);
      }
      return filterCtrl.phase === 'idle' && !world.lock;
    }

    function assertSettled(label) {
      const bad = [...document.querySelectorAll('#colgrid .tile')]
        .filter(t => !t.classList.contains('fhide') && parseFloat(getComputedStyle(t).opacity) < 0.2)
        .map(t => t.dataset.id);
      if (bad.length) jumps.push({ kind: 'STUCK_INVISIBLE', label, bad, sector: world.sector });
    }

    const seq = ['hospitality', 'fmcg', 'spatial', 'all'];
    const horiz = { migrations: [] };

    /* Calm sequence */
    for (const sec of seq) {
      const beforeLeft = Object.fromEntries(
        [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => [t.dataset.id, Math.round(t.getBoundingClientRect().left)])
      );
      const sy = scrollY;
      const st = stmt();
      setFilter(sec);
      /* label immediate */
      const labelOk = world.sector === sec && [...document.querySelectorAll('#filters .fbtn')].find(b => b.dataset.f === sec).classList.contains('on');
      snaps.push({ sec, labelOk, hash: location.hash });
      await waitIdle();
      assertSettled('after:' + sec);
      const afterLeft = Object.fromEntries(
        [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => [t.dataset.id, Math.round(t.getBoundingClientRect().left)])
      );
      for (const id of Object.keys(afterLeft)) {
        if (beforeLeft[id] != null && Math.abs(afterLeft[id] - beforeLeft[id]) > 2) {
          /* microsoft may change width but left should hold */
          horiz.migrations.push({ sec, id, from: beforeLeft[id], to: afterLeft[id] });
        }
      }
      if (Math.abs(scrollY - sy) > 0) jumps.push({ kind: 'SCROLL_END', sec, from: sy, to: scrollY });
      if (Math.abs(stmt().top - st.top) > 0.5) jumps.push({ kind: 'STMT_END', sec, from: st, to: stmt() });
    }

    /* Rapid 25s */
    const rapidStart = performance.now();
    let i = 0;
    const cycle = ['hospitality', 'fmcg', 'spatial', 'all'];
    while (performance.now() - rapidStart < 25000) {
      setFilter(cycle[i % cycle.length]);
      i++;
      await sleep(40 + (i % 5) * 15);
    }
    await waitIdle(3000);
    assertSettled('after-rapid');

    clearInterval(iv);

    const final = {
      sector: world.sector,
      lock: world.lock,
      phase: filterCtrl.phase,
      hash: location.hash,
      staleHidden: [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.visibility === 'hidden').map(t => t.dataset.id),
      ghost: document.querySelector('#ghost').children.length,
      blank: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].length === 0,
      visible: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map(t => t.dataset.id),
      inlineOp: [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.opacity !== '').map(t => t.dataset.id + ':' + t.style.opacity),
      inlineTx: [...document.querySelectorAll('#colgrid .tile')].filter(t => t.style.transform !== '').map(t => t.dataset.id),
      liveAnims: [...document.querySelectorAll('#colgrid .tile')].reduce((n, t) => n + t.getAnimations().length, 0),
      stmt: stmt(),
      scrollY,
    };

    /* Route match */
    const routeOk = (final.sector === 'all' && (final.hash === '#/' || final.hash === ''))
      || final.hash.includes(final.sector);

    return {
      snaps,
      jumps,
      jumpKinds: jumps.reduce((a, j) => { a[j.kind] = (a[j.kind] || 0) + 1; return a; }, {}),
      horiz,
      final,
      routeOk,
      rapidClicks: i,
    };
  });

  await page.close();
  return {
    viewport: `${width}x${height}`,
    ...report,
    consoleErr: consoleErr.filter(e => !/favicon|vidzflow|File not found/i.test(e)),
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const results = [];
try {
  results.push(await runAt(browser, 1440, 900));
  results.push(await runAt(browser, 1180, 800));
} finally {
  await browser.close();
}

function verdict(r) {
  const snapN = (r.jumpKinds.SNAP || 0);
  const stmtN = (r.jumpKinds.STMT || 0) + (r.jumpKinds.STMT_END || 0);
  const scrollN = (r.jumpKinds.SCROLL || 0) + (r.jumpKinds.SCROLL_END || 0);
  const fadeN = (r.jumpKinds.STUCK_INVISIBLE || 0);
  const fail = [];
  if (snapN) fail.push(`SNAP:${snapN}`);
  if (stmtN) fail.push(`STMT:${stmtN}`);
  if (scrollN) fail.push(`SCROLL:${scrollN}`);
  if (fadeN) fail.push(`STUCK_INVISIBLE:${fadeN}`);
  if (r.final.lock) fail.push('LOCK');
  if (r.final.phase !== 'idle') fail.push('PHASE');
  if (r.final.blank) fail.push('BLANK');
  if (r.final.ghost) fail.push('GHOST');
  if (r.final.staleHidden.length) fail.push('STALE');
  if (r.final.liveAnims) fail.push('ANIMS');
  if (r.final.inlineOp.length) fail.push('INLINE_OP');
  if (!r.routeOk) fail.push('ROUTE');
  if (r.horiz.migrations.length) fail.push(`HORIZ:${r.horiz.migrations.length}`);
  if (r.consoleErr.length) fail.push(`CONSOLE:${r.consoleErr.length}`);
  return fail;
}

for (const r of results) {
  const fail = verdict(r);
  console.log('\n===', r.viewport, fail.length ? 'FAIL ' + fail.join(',') : 'PASS', '===');
  console.log('jumpKinds', r.jumpKinds);
  console.log('horiz', r.horiz.migrations.slice(0, 5));
  console.log('final', r.final);
  console.log('snaps', r.snaps);
  console.log('rapidClicks', r.rapidClicks);
  console.log('consoleErr', r.consoleErr.slice(0, 5));
  console.log('sample jumps', JSON.stringify(r.jumps.slice(0, 8)));
}

writeFileSync(join(ROOT, '.qa-tools/filter-stress-results.json'), JSON.stringify(results, null, 2));
const anyFail = results.some(r => verdict(r).length);
process.exit(anyFail ? 1 : 0);
