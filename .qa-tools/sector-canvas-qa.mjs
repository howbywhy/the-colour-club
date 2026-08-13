/**
 * Sector canvas QA — occupancy, no whole-field fade, slot stability, open/close.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 900 },
});

const fails = [];
const ok = (name, cond, detail = '') => {
  if (!cond) fails.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(cond ? 'PASS' : 'FAIL', name, detail);
};

async function fresh() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 25000 });
  await page.waitForFunction(() => typeof world === 'object' && document.querySelectorAll('.tile').length >= 15);
  await sleep(300);
  return { page, errors };
}

function slotProbe() {
  return (() => {
    const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
    const occ = slots.map((s) => s.querySelector(':scope > .tile')?.dataset.id || null);
    const rects = slots.map((s) => {
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const parents = ['#colgrid', '#galleryField', '#collection'].map((sel) => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      return { sel, op: cs.opacity, pe: cs.pointerEvents };
    });
    const tiles = [...document.querySelectorAll('.tile')];
    const dup = tiles.length !== new Set(tiles.map((t) => t.dataset.id)).size;
    return {
      occ,
      rects,
      parents,
      filtered: document.body.classList.contains('filtered'),
      sector: world.sector,
      lock: world.lock,
      phase: filterCtrl.phase,
      tileCount: tiles.length,
      dup,
      slotCount: slots.length,
    };
  })();
}

{
  const { page, errors } = await fresh();
  ok('boot', errors.length === 0, errors.join('|'));

  await page.click('#filters .fbtn[data-f="hospitality"]');
  await sleep(900);
  let st = await page.evaluate(slotProbe);
  ok('hosp-slots', st.slotCount === 6);
  ok('hosp-occ', st.occ.join() === 'dopa,fishfish,roy,gella,lucky,tsukiyo', st.occ.join());
  ok('hosp-parents-op1', st.parents.every((p) => p.op === '1'), JSON.stringify(st.parents));
  ok('hosp-no-dup', !st.dup && st.tileCount === 15);
  const hospRects = st.rects;

  /* Frame sample during Hosp→FMCG */
  const fadeSamples = [];
  await page.evaluate(() => setFilter('fmcg'));
  for (let i = 0; i < 12; i++) {
    await sleep(40);
    const sample = await page.evaluate(() => {
      const parents = ['#colgrid', '#galleryField', '#collection'].map((sel) => getComputedStyle(document.querySelector(sel)).opacity);
      const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
      const r0 = slots[0]?.getBoundingClientRect();
      return {
        parents,
        slot0x: r0 ? Math.round(r0.x) : null,
        filtered: document.body.classList.contains('filtered'),
        emptyField: slots.every((s) => !s.querySelector('.tile')) && document.body.classList.contains('filtered'),
      };
    });
    fadeSamples.push(sample);
  }
  await sleep(400);
  ok(
    'no-parent-fade',
    fadeSamples.every((s) => s.parents.every((op) => op === '1')),
    JSON.stringify(fadeSamples.map((s) => s.parents))
  );
  ok(
    'no-empty-field',
    fadeSamples.every((s) => !s.emptyField),
    'blank sector canvas mid-transition'
  );
  ok(
    'slot0-stable-x',
    fadeSamples.every((s) => s.slot0x === fadeSamples[0].slot0x),
    fadeSamples.map((s) => s.slot0x).join(',')
  );

  st = await page.evaluate(slotProbe);
  ok('fmcg-occ', st.occ.join() === 'sub3,macabalm,willing,rgh,,', st.occ.join(','));
  ok(
    'fmcg-slot-geom',
    st.rects[0].w > 0 &&
      Math.abs(st.rects[0].x - hospRects[0].x) <= 2 &&
      Math.abs(st.rects[1].x - hospRects[1].x) <= 2 &&
      Math.abs(st.rects[2].x - hospRects[2].x) <= 2,
    JSON.stringify({ hosp: hospRects.slice(0, 3), fmcg: st.rects.slice(0, 3) })
  );

  await page.click('#filters .fbtn[data-f="place"]');
  await sleep(800);
  st = await page.evaluate(slotProbe);
  ok('place-occ', st.occ.join() === 'microsoft,mesa,adela,aogc,,', st.occ.join(','));
  ok('place-slot0-left', st.rects[0].x < 80, String(st.rects[0].x));
  ok('place-not-fullwidth', st.rects[0].w < 900, String(st.rects[0].w));

  await page.click('#filters .fbtn[data-f="hospitality"]');
  await sleep(800);
  st = await page.evaluate(slotProbe);
  ok('back-hosp', st.occ.join() === 'dopa,fishfish,roy,gella,lucky,tsukiyo', st.occ.join());

  /* open / close from sector slot */
  await page.evaluate(() => openProject('dopa'));
  await sleep(1000);
  await page.evaluate(() => closeProject());
  await sleep(1100);
  st = await page.evaluate(() => {
    const base = (() => {
      const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
      return {
        occ: slots.map((s) => s.querySelector(':scope > .tile')?.dataset.id || null),
        selected: world.selected,
        sector: world.sector,
      };
    })();
    return base;
  });
  ok('close-restores-slot', st.occ[0] === 'dopa' && st.selected === null && st.sector === 'hospitality', JSON.stringify(st));

  /* All ↔ Sector */
  await page.click('#filters .fbtn[data-f="all"]');
  await sleep(900);
  st = await page.evaluate(slotProbe);
  ok('all-unfiltered', !st.filtered && st.occ.every((x) => x === null));

  for (const f of ['hospitality', 'all', 'fmcg', 'all', 'place', 'all', 'culture', 'all']) {
    await page.click(`#filters .fbtn[data-f="${f}"]`);
    await sleep(850);
  }
  st = await page.evaluate(slotProbe);
  ok('cycle-rest-all', !st.filtered && !st.lock && st.phase === 'idle');

  /* no duplicate after stress */
  ok('final-tiles', st.tileCount === 15 && !st.dup);

  await page.close();
}

/* Responsive occupancy smoke */
for (const [w, h] of [
  [1180, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 812],
]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForFunction(() => typeof world === 'object');
  await sleep(200);
  await page.click('#filters .fbtn[data-f="hospitality"]');
  await sleep(700);
  await page.click('#filters .fbtn[data-f="place"]');
  await sleep(700);
  const st = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('#colgrid > .sector-slot')];
    const occ = slots.map((s) => s.querySelector(':scope > .tile')?.dataset.id || null);
    const parentFade = ['#colgrid', '#galleryField'].some((sel) => getComputedStyle(document.querySelector(sel)).opacity !== '1');
    return { occ, parentFade, lock: world.lock, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  ok(`${w}x${h}-place`, st.occ.join(',') === 'microsoft,mesa,adela,aogc,,' && !st.parentFade && !st.lock && !st.overflow, JSON.stringify(st));
  await page.close();
}

console.log('\n==== SECTOR CANVAS QA ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
