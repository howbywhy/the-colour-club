/**
 * TCC V2 complete 23-project library release-candidate QA.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDS = [
  'sub3', 'mochi', 'dopa', 'rads', 'gella', 'icedtea', 'macabalm', 'fishfish', 'yammy', 'kingbrown',
  'roy', 'tsukiyo', 'willing', 'lucky', 'rare', 'rgh', 'test', 'mesa', 'adela', 'worthy', 'nido', 'aogc', 'microsoft',
];
const OCC = {
  hospitality: 'dopa,fishfish,roy,gella,lucky,tsukiyo,nido,,,,,',
  fmcg: 'sub3,macabalm,willing,rgh,mochi,rads,icedtea,yammy,kingbrown,rare,test,',
  place: 'microsoft,mesa,adela,aogc,,,,,,,,',
  culture: 'worthy,,,,,,,,,,,',
};

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

async function fresh({ hash = '', intro = false, viewport } = {}) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (/vidzflow|favicon|chrome-extension|dropbox/i.test(u)) return;
    failed.push(u);
  });
  await page.evaluateOnNewDocument((skip) => {
    if (skip) sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  }, !intro);
  await page.goto(`${BASE}?_=${Date.now()}${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof world === 'object' && document.querySelectorAll('#colgrid .tile').length >= 23, {
    timeout: 20000,
  });
  await sleep(intro ? 250 : 400);
  return { page, errors, failed };
}

function occProbe() {
  return [...document.querySelectorAll('#colgrid > .sector-slot')]
    .map((s) => s.querySelector(':scope > .tile')?.dataset.id || '')
    .join(',');
}

/* Static */
{
  const data = await (await fetch('http://127.0.0.1:8000/src/data/projects.json')).json();
  ok('json:23', data.projects.length === 23, String(data.projects.length));
  ok('json:ids', data.projects.map((p) => p.id).join() === IDS.join());
  const cats = Object.fromEntries(
    ['hospitality', 'fmcg', 'place', 'culture'].map((c) => [c, data.projects.filter((p) => p.cat === c).length])
  );
  ok('json:cats', JSON.stringify(cats) === JSON.stringify({ hospitality: 7, fmcg: 11, place: 4, culture: 1 }), JSON.stringify(cats));
  ok('json:images', data.assetStatus?.images?.local === 362, JSON.stringify(data.assetStatus?.images));
  const missing = [];
  for (const p of data.projects) {
    for (const m of p.media || []) {
      if (m.type !== 'image' || !m.local) continue;
      const res = await fetch('http://127.0.0.1:8000/' + m.local.replace(/^\//, ''), { method: 'HEAD' });
      if (!res.ok) missing.push(`${p.id}:${m.local}`);
    }
  }
  ok('json:local-images', missing.length === 0, missing.slice(0, 6).join('|'));
  const beatsKept = ['sub3', 'dopa', 'gella'].every((id) => (data.projects.find((p) => p.id === id)?.beats || []).length > 0);
  ok('editorial:beats-kept', beatsKept);
  const newEmpty = ['mochi', 'rads', 'icedtea', 'yammy', 'kingbrown', 'rare', 'test', 'nido'].every(
    (id) => (data.projects.find((p) => p.id === id)?.beats || []).length === 0
  );
  ok('editorial:new-images-only', newEmpty);
}

/* Boot */
{
  const { page, errors, failed } = await fresh();
  ok('boot:console', errors.length === 0, errors.join('|'));
  ok('boot:tiles', (await page.evaluate(() => document.querySelectorAll('#colgrid .tile').length)) === 23);
  ok('boot:clock', await page.$eval('#clock', (el) => /\d/.test(el.textContent)));
  ok('boot:dia', await page.evaluate(() => getComputedStyle(document.body).fontFamily.toLowerCase().includes('dia')));
  ok('boot:no-familjen-req', !(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /familjen|fonts\.google/i.test(r.name)))));
  ok('boot:net', failed.filter((u) => !/vidzflow/i.test(u)).length === 0, failed.slice(0, 4).join('|'));
  await page.close();
}

/* Routes — all 23 + sectors */
for (const id of IDS) {
  const { page, errors } = await fresh({ hash: `#/p/${id}` });
  const st = await page.evaluate(() => ({
    selected: world.selected,
    lock: world.lock,
    stack: document.querySelectorAll('#stack .sth').length,
    ideaDisplay: getComputedStyle(document.querySelector('#mIdea')).display,
    beats: document.querySelectorAll('#beats .beat').length,
  }));
  ok(`project:${id}`, errors.length === 0 && st.selected === id && !st.lock && st.stack === 8, JSON.stringify(st));
  if (['mochi', 'test', 'nido', 'rads'].includes(id)) {
    ok(`idea-hidden:${id}`, st.ideaDisplay === 'none');
  }
  await page.close();
}

/* Filters */
{
  const { page } = await fresh();
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
    await page.evaluate(() => setFilter('all', true));
    await sleep(100);
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(950);
    const modes = await page.evaluate(() => filterCtrl.entryModes || []);
    const occ = await page.evaluate(occProbe);
    ok(
      `all→${sec}:settle`,
      modes.length > 0 && modes.every((m) => (m.mode || m) === 'SECTOR_SETTLE'),
      JSON.stringify(modes.slice(0, 3))
    );
    ok(`all→${sec}:occ`, occ === OCC[sec], occ);
  }
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture', 'hospitality']) {
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(850);
  }
  await page.evaluate(() => setFilter('all'));
  await sleep(1000);
  ok('filter:rest-all', await page.evaluate(() => world.sector === 'all' && !world.lock && filterCtrl.phase === 'idle'));

  await page.click('#viewBtn');
  await sleep(500);
  ok('index:23', await page.evaluate(() => world.view === 'index' && document.querySelectorAll('#colgrid .tile:not(.fhide)').length === 23));
  await page.evaluate(() => setView('field', true));
  await page.close();
}

/* Idea close stack regression */
{
  const { page } = await fresh();
  await page.evaluate(() => openProject('dopa'));
  await sleep(900);
  await page.evaluate(() => setDepth('idea'));
  await sleep(400);
  await page.evaluate(() => closeProject());
  await sleep(1100);
  const stack = await page.evaluate(() => {
    const s = document.querySelector('#stack');
    const cs = getComputedStyle(s);
    return {
      selected: world.selected,
      show: s.classList.contains('show'),
      op: cs.opacity,
      vis: cs.visibility,
      pe: cs.pointerEvents,
      kids: s.children.length,
    };
  });
  ok(
    'idea-close-stack',
    stack.selected === null && !stack.show && stack.op === '0' && stack.vis === 'hidden' && stack.pe === 'none' && stack.kids === 0,
    JSON.stringify(stack)
  );
  await page.close();
}

/* Lateral wrap */
{
  const { page } = await fresh();
  await page.evaluate(() => openProject('sub3'));
  await sleep(800);
  await page.evaluate(() => lateral('microsoft'));
  await sleep(900);
  ok('lateral:wrap-prev', await page.evaluate(() => world.selected === 'microsoft'));
  await page.evaluate(() => lateral('mochi'));
  await sleep(900);
  ok('lateral:next', await page.evaluate(() => world.selected === 'mochi'));
  await page.evaluate(() => closeProject());
  await sleep(900);
  await page.close();
}

/* Showreel first paint */
{
  const { page } = await fresh({ intro: true });
  await sleep(200);
  const st = await page.evaluate(() => {
    const stage = document.querySelector('#introStage');
    const mark = document.querySelector('#introMark');
    const reel = document.querySelector('#introReel');
    return {
      boot: document.documentElement.classList.contains('intro-boot'),
      bg: getComputedStyle(stage).backgroundColor,
      color: getComputedStyle(mark).color,
      reelOp: Number(getComputedStyle(reel).opacity),
      fs: getComputedStyle(mark).fontSize,
    };
  });
  ok('intro:first', st.boot && st.bg === 'rgb(255, 255, 255)' && st.color === 'rgb(16, 16, 20)' && st.reelOp < 0.05, JSON.stringify(st));
  await page.click('#introEnter');
  await sleep(1200);
  ok('intro:done', await page.evaluate(() => document.querySelector('#introStage').hidden && sessionStorage.getItem('tccIntro') === '1'));
  await page.close();
}

/* Responsive smoke */
for (const [w, h] of [
  [1440, 900],
  [1180, 800],
  [768, 1024],
  [390, 844],
]) {
  const { page } = await fresh({ viewport: { width: w, height: h } });
  await page.evaluate(() => setFilter('fmcg'));
  await sleep(800);
  await page.evaluate(() => setFilter('all'));
  await sleep(900);
  const st = await page.evaluate(() => ({
    sector: world.sector,
    lock: world.lock,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    n: document.querySelectorAll('#colgrid .tile').length,
  }));
  ok(`resp:${w}x${h}`, st.sector === 'all' && !st.lock && !st.overflow && st.n === 23, JSON.stringify(st));
  await page.close();
}

console.log('\n==== RC COMPLETE LIBRARY ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.map((f) => ' - ' + f).join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
