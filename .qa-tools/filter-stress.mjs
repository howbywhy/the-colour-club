/**
 * Filter stress — All authored ↔ Sector shared pack:
 * - Visual All↔Sector may FLIP (capped); Sector→Sector is short replace
 * - Horizontal reflow inside the sector grammar is expected (not a failure)
 * Still fails on: held blank end-state, survivor opacity dips, statement/scroll
 * drift, stale tiles, locks, route/state mismatch, stuck invisibles.
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOVE_MAX = 720;

const MAP = {
  sub3: 'fmcg',
  dopa: 'hospitality',
  fishfish: 'hospitality',
  roy: 'hospitality',
  gella: 'hospitality',
  lucky: 'hospitality',
  macabalm: 'fmcg',
  willing: 'fmcg',
  tsukiyo: 'hospitality',
  microsoft: 'place',
  mesa: 'place',
  adela: 'place',
  aogc: 'place',
  worthy: 'culture',
  rgh: 'fmcg',
};

async function runAt(browser, width, height, mode /* 'visual' | 'index' */) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const consoleErr = [];
  page.on('pageerror', (e) => consoleErr.push(String(e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErr.push(m.text());
  });
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('tccIntro', '1');
      sessionStorage.setItem('tccAllV', '1');
    } catch (e) {}
  });
  await page.goto(BASE + '?allv=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colgrid .tile');
  await sleep(400);
  await page.evaluate((map) => {
    document.querySelectorAll('#colgrid .tile').forEach((t) => {
      t.dataset.cat = map[t.dataset.id] || '';
      t.dataset.keepId = t.dataset.id;
    });
  }, MAP);

  if (mode === 'index') {
    await page.click('#viewBtn');
    await sleep(650);
  }

  const report = await page.evaluate(
    async (moveMax, mode) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const willShow = (sec, t) => sec === 'all' || t.dataset.cat === sec;
      const stmt = () => {
        const r = document.querySelector('#collectionIntro').getBoundingClientRect();
        return { top: r.top, left: r.left };
      };
      const jumps = [];
      const snaps = [];
      let prev = null;
      const tick = () => {
        const next = filterCtrl.target || world.sector;
        const tiles = [...document.querySelectorAll('#colgrid .tile')].map((t) => {
          const r = t.getBoundingClientRect();
          const cs = getComputedStyle(t);
          return {
            id: t.dataset.id,
            cat: t.dataset.cat,
            fhide: t.classList.contains('fhide'),
            left: r.left,
            top: r.top,
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
        };
        /* Transient empty field during Sector→Sector replace is allowed;
           held blank after settle is caught via final.blank / BLANK_END. */
        if (prev) {
          if (Math.abs(now.stmt.top - prev.stmt.top) > 0.5 || Math.abs(now.stmt.left - prev.stmt.left) > 0.5) {
            jumps.push({ kind: 'STMT', from: prev.stmt, to: now.stmt, phase: now.phase });
          }
          if (Math.abs(now.scrollY - prev.scrollY) > 0) {
            jumps.push({ kind: 'SCROLL', from: prev.scrollY, to: now.scrollY, phase: now.phase });
          }
          for (const t of now.tiles) {
            const p = prev.tiles.find((x) => x.id === t.id);
            /* Survivor opacity must not dip — tile was solidly visible and remains in the next set. */
            if (
              p &&
              !p.fhide &&
              !t.fhide &&
              p.op >= 0.98 &&
              t.op < 0.98 &&
              willShow(next, { dataset: { cat: t.cat } })
            ) {
              jumps.push({ kind: 'SURVIVOR_FADE', id: t.id, op: t.op, phase: now.phase });
            }
            if (t.fhide) continue;
            if (!p || p.fhide) continue;
            const dL = t.left - p.left,
              dT = t.top - p.top;
            const dist = Math.hypot(dL, dT);
            const hasTx = t.tx && t.tx !== 'none';
            if (dist > 6 && !hasTx && now.phase !== 'leaving') {
              jumps.push({
                kind: dist > moveMax ? 'SNAP_LARGE' : 'SNAP_MICRO',
                id: t.id,
                dL: Math.round(dL),
                dT: Math.round(dT),
                dist: Math.round(dist),
                phase: now.phase,
                sector: now.sector,
              });
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
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            if (filterCtrl.phase === 'idle' && !world.lock) return true;
          }
          await sleep(20);
        }
        return filterCtrl.phase === 'idle' && !world.lock;
      }

      function assertSettled(label) {
        const bad = [...document.querySelectorAll('#colgrid .tile')]
          .filter((t) => !t.classList.contains('fhide') && parseFloat(getComputedStyle(t).opacity) < 0.2)
          .map((t) => t.dataset.id);
        if (bad.length) jumps.push({ kind: 'STUCK_INVISIBLE', label, bad, sector: world.sector });
      }

      const seq = ['hospitality', 'fmcg', 'place', 'culture', 'all', 'hospitality', 'all', 'fmcg', 'place', 'all'];
      const horiz = { migrations: [] };
      const ids0 = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.keepId);

      for (const sec of seq) {
        const beforeLeft = Object.fromEntries(
          [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map((t) => [
            t.dataset.id,
            Math.round(t.getBoundingClientRect().left),
          ])
        );
        const sy = scrollY;
        const st = stmt();
        setFilter(sec);
        const labelOk =
          world.sector === sec &&
          [...document.querySelectorAll('#filters .fbtn')].find((b) => b.dataset.f === sec).classList.contains('on');
        snaps.push({ sec, labelOk, hash: location.hash });
        await waitIdle();
        assertSettled('after:' + sec);
        const afterLeft = Object.fromEntries(
          [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map((t) => [
            t.dataset.id,
            Math.round(t.getBoundingClientRect().left),
          ])
        );
        if (mode === 'visual') {
          for (const id of Object.keys(afterLeft)) {
            if (beforeLeft[id] != null && Math.abs(afterLeft[id] - beforeLeft[id]) > 2) {
              horiz.migrations.push({ sec, id, from: beforeLeft[id], to: afterLeft[id] });
            }
          }
        }
        if (Math.abs(scrollY - sy) > 0) jumps.push({ kind: 'SCROLL_END', sec, from: sy, to: scrollY });
        if (Math.abs(stmt().top - st.top) > 0.5) jumps.push({ kind: 'STMT_END', sec, from: st, to: stmt() });
      }

      const ids1 = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.keepId);
      if (ids0.join() !== ids1.join()) jumps.push({ kind: 'DOM_REBUILD' });

      /* Rapid */
      const rapidStart = performance.now();
      let i = 0;
      const cycle = ['hospitality', 'fmcg', 'place', 'culture', 'all'];
      while (performance.now() - rapidStart < 12000) {
        setFilter(cycle[i % cycle.length]);
        i++;
        await sleep(40 + (i % 5) * 15);
      }
      await waitIdle(3000);
      assertSettled('after-rapid');

      /* History Back / Forward */
      const hist = [];
      setFilter('hospitality');
      await waitIdle();
      hist.push({ step: 'hosp', sector: world.sector, hash: location.hash });
      setFilter('fmcg');
      await waitIdle();
      hist.push({ step: 'fmcg', sector: world.sector, hash: location.hash });
      history.back();
      await sleep(200);
      await waitIdle();
      hist.push({
        step: 'back',
        sector: world.sector,
        hash: location.hash,
        match: world.sector === 'hospitality',
      });
      history.forward();
      await sleep(200);
      await waitIdle();
      hist.push({
        step: 'forward',
        sector: world.sector,
        hash: location.hash,
        match: world.sector === 'fmcg',
      });

      clearInterval(iv);

      const final = {
        sector: world.sector,
        lock: world.lock,
        phase: filterCtrl.phase,
        hash: location.hash,
        staleHidden: [...document.querySelectorAll('#colgrid .tile')]
          .filter((t) => t.style.visibility === 'hidden')
          .map((t) => t.dataset.id),
        filterGhosts: document.querySelectorAll('#ghost > .fg').length,
        blank: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].length === 0,
        visible: [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map((t) => t.dataset.id),
        inlineOp: [...document.querySelectorAll('#colgrid .tile')]
          .filter((t) => t.style.opacity !== '')
          .map((t) => t.dataset.id + ':' + t.style.opacity),
        inlineTx: [...document.querySelectorAll('#colgrid .tile')]
          .filter((t) => t.style.transform !== '')
          .map((t) => t.dataset.id),
        liveAnims: [...document.querySelectorAll('#colgrid .tile')].reduce((n, t) => n + t.getAnimations().length, 0),
        stmt: stmt(),
        scrollY,
        index: document.body.classList.contains('x'),
        fieldMin: getComputedStyle(document.querySelector('#galleryField')).minHeight,
      };

      const routeOk =
        (final.sector === 'all' && (final.hash === '#/' || final.hash === '' || final.hash === '#/index')) ||
        final.hash.includes(final.sector);

      return {
        snaps,
        jumps,
        jumpKinds: jumps.reduce((a, j) => {
          a[j.kind] = (a[j.kind] || 0) + 1;
          return a;
        }, {}),
        horiz,
        final,
        routeOk,
        rapidClicks: i,
        hist,
        histOk: hist.every((h) => h.match !== false),
      };
    },
    MOVE_MAX,
    mode
  );

  await page.close();
  return {
    viewport: `${width}x${height}`,
    mode,
    ...report,
    consoleErr: consoleErr.filter((e) => !/favicon|vidzflow|File not found/i.test(e)),
  };
}

function verdict(r) {
  const fail = [];
  const jk = r.jumpKinds || {};
  /* Approved: SNAP_LARGE (>800) may snap/capped; Index never FLIPs.
     Desktop Visual: many SNAP_MICRO suggests FLIP regression. */
  const micro = jk.SNAP_MICRO || 0;
  const isNarrow = /390x|375x|430x/.test(r.viewport);
  if (r.mode === 'visual' && !isNarrow && micro > 8) fail.push(`SNAP_MICRO:${micro}`);
  if ((jk.STMT || 0) + (jk.STMT_END || 0)) fail.push(`STMT:${(jk.STMT || 0) + (jk.STMT_END || 0)}`);
  if ((jk.SCROLL || 0) + (jk.SCROLL_END || 0)) fail.push(`SCROLL:${(jk.SCROLL || 0) + (jk.SCROLL_END || 0)}`);
  if (jk.STUCK_INVISIBLE) fail.push(`STUCK_INVISIBLE:${jk.STUCK_INVISIBLE}`);
  if (jk.SURVIVOR_FADE) fail.push(`SURVIVOR_FADE:${jk.SURVIVOR_FADE}`);
  if (jk.DOM_REBUILD) fail.push('DOM_REBUILD');
  if (r.final.lock) fail.push('LOCK');
  if (r.final.phase !== 'idle') fail.push('PHASE');
  if (r.final.blank) fail.push('BLANK_END');
  if (r.final.filterGhosts) fail.push('FILTER_GHOST');
  if (r.final.staleHidden.length) fail.push('STALE');
  if (r.final.liveAnims) fail.push('ANIMS');
  if (r.final.inlineOp.length) fail.push('INLINE_OP');
  if (!r.routeOk) fail.push('ROUTE');
  /* horiz.migrations logged for review — sector pack may shift columns */
  if (!r.histOk) fail.push('HISTORY');
  if (r.mode === 'index' && !(parseFloat(r.final.fieldMin) > 0)) fail.push('INDEX_MIN');
  if (r.consoleErr.length) fail.push(`CONSOLE:${r.consoleErr.length}`);
  return fail;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const viewports = [
  [1440, 900],
  [1180, 800],
  [768, 1024],
  [390, 844],
];
const results = [];
try {
  for (const [w, h] of viewports) {
    results.push(await runAt(browser, w, h, 'visual'));
    results.push(await runAt(browser, w, h, 'index'));
  }
} finally {
  await browser.close();
}

let anyFail = false;
for (const r of results) {
  const fail = verdict(r);
  if (fail.length) anyFail = true;
  console.log('\n===', r.mode, r.viewport, fail.length ? 'FAIL ' + fail.join(',') : 'PASS', '===');
  console.log('jumpKinds', r.jumpKinds);
  console.log('rapidClicks', r.rapidClicks, 'histOk', r.histOk, 'routeOk', r.routeOk);
  if (fail.length) {
    console.log('final', r.final);
    console.log('sample jumps', JSON.stringify(r.jumps.filter((j) => !/^SNAP_LARGE$/.test(j.kind)).slice(0, 12)));
    console.log('consoleErr', r.consoleErr.slice(0, 5));
  }
}

writeFileSync(join(ROOT, '.qa-tools/filter-stress-results.json'), JSON.stringify(results, null, 2));
process.exit(anyFail ? 1 : 0);
