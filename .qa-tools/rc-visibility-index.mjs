/**
 * Gates: Index natural height + complete 23-project visibility / routes / lateral.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IDS = [
  'sub3', 'mochi', 'dopa', 'rads', 'gella', 'icedtea', 'macabalm', 'fishfish', 'yammy', 'kingbrown',
  'roy', 'tsukiyo', 'willing', 'lucky', 'rare', 'rgh', 'test', 'mesa', 'adela', 'worthy', 'nido', 'aogc', 'microsoft',
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 900 },
});
const fails = [];
const ok = (n, c, d = '') => {
  if (!c) fails.push(`${n}${d ? ': ' + d : ''}`);
  console.log(c ? 'PASS' : 'FAIL', n, d);
};

async function fresh(hash = '', allv = '1') {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument((v) => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', v);
  }, allv);
  await page.goto(`${BASE}?allv=${allv}&_=${Date.now()}${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof world === 'object' && document.querySelectorAll('.tile').length >= 23);
  await sleep(400);
  return { page, errors };
}

/* ---- Index natural heights ---- */
{
  const { page } = await fresh('#/index');
  const heights = {};
  for (const sec of ['all', 'hospitality', 'fmcg', 'place', 'culture']) {
    await page.evaluate((s) => setFilter(s, true), sec);
    await sleep(120);
    heights[sec] = await page.evaluate(() => ({
      bodyH: document.documentElement.scrollHeight,
      fieldMin: document.querySelector('#galleryField').style.minHeight || getComputedStyle(document.querySelector('#galleryField')).minHeight,
      rows: [...document.querySelectorAll('#colgrid .tile')].filter((t) => !t.classList.contains('fhide')).length,
    }));
  }
  console.log('INDEX HEIGHTS', heights);
  ok('index:all-rows', heights.all.rows === 23);
  ok('index:hosp-rows', heights.hospitality.rows === 7);
  ok('index:fmcg-rows', heights.fmcg.rows === 11);
  ok('index:place-rows', heights.place.rows === 4);
  ok('index:culture-rows', heights.culture.rows === 1);
  ok('index:no-locked-min', ['0px', 'auto', ''].includes(heights.all.fieldMin) || parseFloat(heights.all.fieldMin) < 40, heights.all.fieldMin);
  ok('index:culture-shorter', heights.culture.bodyH < heights.all.bodyH * 0.55, `${heights.culture.bodyH} vs ${heights.all.bodyH}`);
  ok('index:place-shorter', heights.place.bodyH < heights.fmcg.bodyH, `${heights.place.bodyH} vs ${heights.fmcg.bodyH}`);
  ok('index:hosp-shorter-than-all', heights.hospitality.bodyH < heights.all.bodyH, `${heights.hospitality.bodyH} vs ${heights.all.bodyH}`);

  /* deep All → Culture clamp */
  await page.evaluate(() => setFilter('all', true));
  await page.evaluate(() => scrollTo(0, 5000));
  await sleep(80);
  await page.evaluate(() => setFilter('culture'));
  await sleep(700);
  const clamp = await page.evaluate(() => ({
    y: scrollY,
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    bodyH: document.documentElement.scrollHeight,
  }));
  ok('index:culture-clamp', clamp.y <= clamp.max + 1 && clamp.y < 400, JSON.stringify(clamp));
  await page.close();
}

/* ---- Visual/Index independent scroll ---- */
{
  const { page } = await fresh();
  await page.evaluate(() => scrollTo(0, 2200));
  await sleep(80);
  await page.evaluate(() => setView('index'));
  await sleep(500);
  const onIndex = await page.evaluate(() => ({ view: world.view, y: scrollY, fieldY: world.ledger.fieldY, indexY: world.ledger.indexY }));
  ok('scroll:index-not-inherit-visual', onIndex.view === 'index' && onIndex.y < 400, JSON.stringify(onIndex));
  await page.evaluate(() => scrollTo(0, 600));
  await sleep(80);
  await page.evaluate(() => setView('field'));
  await sleep(500);
  const onField = await page.evaluate(() => ({ view: world.view, y: scrollY, fieldY: world.ledger.fieldY }));
  ok('scroll:visual-restored', onField.view === 'field' && onField.y > 1500, JSON.stringify(onField));
  await page.evaluate(() => setView('index'));
  await sleep(500);
  const backIx = await page.evaluate(() => ({ y: scrollY, max: Math.max(0, document.documentElement.scrollHeight - innerHeight) }));
  ok('scroll:index-restored-clamped', backIx.y >= 200 && backIx.y <= backIx.max + 1, JSON.stringify(backIx));
  await page.close();
}

/* ---- All variants 23/23 ---- */
const matrix = {};
for (const v of ['1', '2', '3', '4']) {
  const { page } = await fresh('', v);
  const st = await page.evaluate((IDS) => {
    const tiles = [...document.querySelectorAll('#colgrid .tile')];
    const ids = tiles.map((t) => t.dataset.id);
    const dup = ids.length !== new Set(ids).size;
    const missing = IDS.filter((id) => !ids.includes(id));
    const bad = tiles
      .filter((t) => {
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return (
          t.classList.contains('fhide') ||
          cs.display === 'none' ||
          Number(cs.opacity) < 0.5 ||
          r.width < 2 ||
          r.height < 2 ||
          t.parentElement?.classList.contains('sector-slot')
        );
      })
      .map((t) => t.dataset.id);
    const tops = tiles.map((t) => t.getBoundingClientRect().top + scrollY);
    let overlaps = 0;
    const rects = tiles.map((t) => {
      const r = t.getBoundingClientRect();
      return { id: t.dataset.id, x: r.left, y: r.top + scrollY, w: r.width, h: r.height };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i],
          b = rects[j];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        if (ix > 24 && iy > 24) overlaps++;
      }
    }
    return {
      n: tiles.length,
      dup,
      missing,
      bad,
      overlaps,
      bodyH: document.documentElement.scrollHeight,
      maxTop: Math.round(Math.max(...tops)),
      offCanvas: rects.filter((r) => r.x + r.w < 0 || r.x > innerWidth + 2).map((r) => r.id),
    };
  }, IDS);
  matrix[`V${v}`] = st;
  ok(`allv${v}:23`, st.n === 23 && !st.dup && st.missing.length === 0 && st.bad.length === 0, JSON.stringify(st));
  ok(`allv${v}:geom`, st.overlaps === 0 && st.offCanvas.length === 0, JSON.stringify(st));
  await page.close();
}
console.log('ALL VARIANTS', matrix);

/* ---- Filter counts Visual + Index ---- */
{
  const { page } = await fresh();
  for (const [sec, n] of [
    ['hospitality', 7],
    ['fmcg', 11],
    ['place', 4],
    ['culture', 1],
  ]) {
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(900);
    const vis = await page.evaluate(
      () =>
        [...document.querySelectorAll('#colgrid > .sector-slot > .tile, #colgrid > .tile:not(.fhide)')].filter((t) => {
          if (t.classList.contains('fhide')) return false;
          if (document.body.classList.contains('filtered') && t.parentElement?.id === 'colgrid') return false;
          return true;
        }).length
    );
    const occ = await page.evaluate(
      () => [...document.querySelectorAll('#colgrid > .sector-slot')].map((s) => s.querySelector('.tile')?.dataset.id).filter(Boolean).length
    );
    ok(`visual:${sec}`, occ === n, `occ=${occ}`);
  }
  await page.evaluate(() => setView('index'));
  await sleep(400);
  for (const [sec, n] of [
    ['all', 23],
    ['hospitality', 7],
    ['fmcg', 11],
    ['place', 4],
    ['culture', 1],
  ]) {
    await page.evaluate((s) => setFilter(s, true), sec);
    await sleep(100);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#colgrid .tile')].filter((t) => !t.classList.contains('fhide')).length);
    ok(`index:${sec}`, rows === n, String(rows));
  }
  await page.close();
}

/* ---- Routes + covers ---- */
{
  const { page, errors } = await fresh();
  const coverFails = await page.evaluate(async (IDS) => {
    const bad = [];
    for (const id of IDS) {
      const img = document.querySelector(`.tile[data-id="${id}"] .ph img`);
      if (!img) {
        bad.push(id + ':no-img');
        continue;
      }
      img.scrollIntoView({ block: 'center' });
      if (!img.complete || img.naturalWidth < 2) {
        await new Promise((r) => {
          img.onload = r;
          img.onerror = r;
          setTimeout(r, 2500);
        });
      }
      const src = img.currentSrc || img.src || '';
      if (!src || /website-files\.com/.test(src)) bad.push(id + ':remote-or-empty');
      else if (!img.complete || img.naturalWidth < 2) bad.push(id + ':decode');
    }
    return bad;
  }, IDS);
  ok('covers:23', coverFails.length === 0, coverFails.join('|'));

  for (const id of IDS) {
    await page.evaluate((i) => openProject(i), id);
    await sleep(700);
    const st = await page.evaluate(() => ({
      selected: world.selected,
      stack: document.querySelectorAll('#stack .sth').length,
      idea: getComputedStyle(document.querySelector('#mIdea')).display,
      hero: !!document.querySelector('#heroImg')?.getAttribute('src'),
    }));
    ok(`route:${id}`, st.selected === id && st.stack === 8 && st.hero, JSON.stringify(st));
    await page.evaluate(() => closeProject());
    await sleep(700);
  }
  ok('routes:console', errors.length === 0, errors.join('|'));
  await page.close();
}

/* ---- Lateral complete loops ---- */
{
  const { page } = await fresh();
  await page.evaluate(() => openProject('sub3'));
  await sleep(700);
  const nextSeq = ['sub3'];
  for (let i = 0; i < 23; i++) {
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#stack .sth')].map((s) => s.dataset.id);
      /* click the immediate next neighbour in stack — use lateral on canonical next */
      const all = window.world && document.querySelectorAll('#colgrid .tile');
    });
    const next = await page.evaluate(() => {
      const order = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.id);
      const i = order.indexOf(world.selected);
      const n = order[(i + 1) % order.length];
      lateral(n);
      return n;
    });
    await sleep(650);
    nextSeq.push(next);
    const sel = await page.evaluate(() => world.selected);
    if (sel !== next) ok(`next-step-${i}`, false, `${sel}!=${next}`);
  }
  ok('lateral:next-loop', nextSeq[23] === 'sub3' && new Set(nextSeq.slice(0, 23)).size === 23, nextSeq.join(','));

  const prevSeq = [await page.evaluate(() => world.selected)];
  for (let i = 0; i < 23; i++) {
    const prev = await page.evaluate(() => {
      const order = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.id);
      const i = order.indexOf(world.selected);
      const n = order[(i - 1 + order.length) % order.length];
      lateral(n);
      return n;
    });
    await sleep(650);
    prevSeq.push(prev);
  }
  ok('lateral:prev-loop', prevSeq[23] === 'sub3' && new Set(prevSeq.slice(0, 23)).size === 23, prevSeq.join(','));
  await page.close();
}

/* ---- Mobile 23 ---- */
for (const [w, h] of [
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
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof world === 'object');
  await sleep(300);
  const st = await page.evaluate(() => ({
    n: document.querySelectorAll('#colgrid .tile').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  await page.evaluate(() => setView('index'));
  await sleep(300);
  const ix = await page.evaluate(() => document.querySelectorAll('#colgrid .tile:not(.fhide)').length);
  ok(`mobile:${w}`, st.n === 23 && ix === 23 && !st.overflow, JSON.stringify({ st, ix }));
  await page.close();
}

console.log('\n==== VISIBILITY + INDEX HEIGHT ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.map((f) => ' - ' + f).join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
