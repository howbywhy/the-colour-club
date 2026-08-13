/**
 * TCC V2 full-library release-candidate QA.
 * Covers 15 projects, Place/Culture taxonomy, showreel skip, filter language stress.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDS = [
  'sub3', 'dopa', 'gella', 'macabalm', 'fishfish', 'roy', 'tsukiyo', 'willing',
  'lucky', 'rgh', 'mesa', 'adela', 'worthy', 'aogc', 'microsoft',
];
const OCC = {
  hospitality: 'dopa,fishfish,roy,gella,lucky,tsukiyo',
  fmcg: 'sub3,macabalm,willing,rgh,,',
  place: 'microsoft,mesa,adela,aogc,,',
  culture: 'worthy,,,,,',
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
    if (/vidzflow|favicon|chrome-extension/i.test(u)) return;
    failed.push(u);
  });
  await page.evaluateOnNewDocument((skipIntro) => {
    if (skipIntro) sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  }, !intro);
  await page.goto(`${BASE}?_=${Date.now()}${hash}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof world === 'object');
  await sleep(intro ? 200 : 350);
  return { page, errors, failed };
}

function occProbe() {
  return [...document.querySelectorAll('#colgrid > .sector-slot')].map(
    (s) => s.querySelector(':scope > .tile')?.dataset.id || null
  );
}

/* ---- Static data integrity ---- */
{
  const data = await (await fetch('http://127.0.0.1:8000/src/data/projects.json')).json();
  const projects = data.projects;
  ok('json:15', projects.length === 15, String(projects.length));
  ok('json:ids', projects.map((p) => p.id).join() === IDS.join());
  const cats = Object.fromEntries(
    ['hospitality', 'fmcg', 'place', 'culture'].map((c) => [c, projects.filter((p) => p.cat === c).length])
  );
  ok('json:cats', JSON.stringify(cats) === JSON.stringify({ hospitality: 6, fmcg: 4, place: 4, culture: 1 }), JSON.stringify(cats));
  ok('json:no-spatial-cat', projects.every((p) => p.cat !== 'spatial'));
  ok('json:assets', data.assetStatus?.images?.local === 289, JSON.stringify(data.assetStatus?.images));
  const missingLocal = [];
  for (const p of projects) {
    for (const m of p.media || []) {
      if (m.type && m.type !== 'image') continue;
      const local = m.local;
      if (!local || local.startsWith('http')) continue;
      const res = await fetch(`http://127.0.0.1:8000/${local.replace(/^\//, '')}`, { method: 'HEAD' });
      if (!res.ok) missingLocal.push(`${p.id}:${local}:${res.status}`);
    }
  }
  ok('json:local-images', missingLocal.length === 0, missingLocal.slice(0, 8).join('|'));
}

/* ---- Boot + chrome ---- */
{
  const { page, errors, failed } = await fresh();
  ok('boot:console', errors.length === 0, errors.join('|'));
  ok('boot:tiles', await page.evaluate(() => document.querySelectorAll('#colgrid .tile').length) === 15);
  ok('boot:clock', await page.$eval('#clock', (el) => /\d{2}:\d{2}/.test(el.textContent)));
  ok('boot:filters', await page.evaluate(() =>
    [...document.querySelectorAll('#filters .fbtn')].map((b) => b.dataset.f).join() ===
    'all,hospitality,fmcg,place,culture'
  ));
  ok(
    'boot:no-Spatial-filter',
    await page.evaluate(() => ![...document.querySelectorAll('#filters .fbtn')].some((b) => /spatial/i.test(b.textContent + b.dataset.f)))
  );
  ok('boot:dia', await page.evaluate(() => getComputedStyle(document.body).fontFamily.toLowerCase().includes('dia')));
  ok('boot:net', failed.length === 0, failed.slice(0, 5).join('|'));
  await page.close();
}

/* ---- All 15 project routes ---- */
for (const id of IDS) {
  const { page, errors } = await fresh({ hash: `#/p/${id}` });
  const st = await page.evaluate(() => ({
    selected: world.selected,
    lock: world.lock,
    hero: !!document.querySelector('#heroImg')?.getAttribute('src'),
    stack: document.querySelectorAll('#stack .sth').length,
  }));
  ok(`project:${id}`, errors.length === 0 && st.selected === id && !st.lock && st.hero && st.stack === 8, JSON.stringify(st));
  await page.close();
}

/* ---- Sector occupancy + All stress ---- */
{
  const { page } = await fresh();
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
    await page.evaluate((s) => setFilter('all', true), sec);
    await sleep(200);
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(900);
    const modes = await page.evaluate(() => filterCtrl?.entryModes || []);
    const occ = await page.evaluate(occProbe);
    ok(
      `all→${sec}:settle`,
      modes.length > 0 && modes.every((m) => (typeof m === 'string' ? m : m.mode) === 'SECTOR_SETTLE'),
      JSON.stringify(modes)
    );
    ok(`all→${sec}:occ`, occ.join(',') === OCC[sec], occ.join(','));
  }

  /* sector cycle */
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture', 'hospitality']) {
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(850);
    const occ = await page.evaluate(occProbe);
    ok(`cycle→${sec}`, occ.join(',') === OCC[sec] && (await page.evaluate(() => world.sector)) === sec, occ.join(','));
  }

  await page.evaluate(() => setFilter('all'));
  await sleep(1000);
  ok(
    'cycle→all',
    await page.evaluate(
      () => world.sector === 'all' && !document.body.classList.contains('filtered') && !world.lock && filterCtrl.phase === 'idle'
    )
  );

  /* Index shows 15 */
  await page.click('#viewBtn');
  await sleep(600);
  const ix = await page.evaluate(() => ({
    view: world.view,
    n: document.querySelectorAll('#colgrid .tile:not(.fhide)').length,
  }));
  ok('index:15', ix.view === 'index' && ix.n === 15, JSON.stringify(ix));
  await page.evaluate(() => setView('field', true));
  await sleep(200);
  await page.close();
}

/* ---- Project open/close + Idea + stack ---- */
{
  const { page } = await fresh();
  await page.evaluate(() => openProject('worthy'));
  await sleep(1000);
  /* Worthy has no Idea beats — Images-only */
  const worthyMode = await page.evaluate(() => ({
    ideaDisplay: getComputedStyle(document.querySelector('#mIdea')).display,
    depth: world.depth,
  }));
  ok('idea:hidden-when-empty', worthyMode.ideaDisplay === 'none' && worthyMode.depth !== 'idea', JSON.stringify(worthyMode));
  await page.evaluate(() => closeProject());
  await sleep(1100);
  const after = await page.evaluate(() => ({
    selected: world.selected,
    stackKids: document.querySelector('#stack').children.length,
    show: document.querySelector('#stack').classList.contains('show'),
  }));
  ok('close:stack-clear', after.selected === null && after.stackKids === 0 && !after.show, JSON.stringify(after));

  await page.evaluate(() => openProject('dopa'));
  await sleep(900);
  await page.evaluate(() => setDepth('idea'));
  await sleep(400);
  ok('idea:dopa', await page.evaluate(() => world.depth === 'idea' && document.querySelectorAll('#beats .beat').length >= 1));
  await page.evaluate(() => setDepth('images'));
  await sleep(200);
  await page.evaluate(() => closeProject());
  await sleep(900);

  await page.evaluate(() => openProject('mesa'));
  await sleep(900);
  await page.evaluate(() => lateral('adela'));
  await sleep(900);
  ok('lateral', await page.evaluate(() => world.selected === 'adela'));
  await page.evaluate(() => closeProject());
  await sleep(1000);
  await page.close();
}

/* ---- Info + signup surface + favicon ---- */
{
  const { page } = await fresh();
  await page.click('#infoBtn');
  await sleep(400);
  ok('info:open', await page.evaluate(() => world.infoOpen));
  ok('info:signup', await page.$('#signup-email-info'));
  await page.evaluate(() => closeInfo());
  await sleep(300);
  const fav = await page.evaluate(() => !!document.querySelector('link[rel="icon"]'));
  ok('favicon', fav);
  await page.close();
}

/* ---- Deep links ---- */
for (const [hash, check] of [
  ['#/', (s) => s.sector === 'all' && !s.selected],
  ['#/hospitality', (s) => s.sector === 'hospitality'],
  ['#/fmcg', (s) => s.sector === 'fmcg'],
  ['#/place', (s) => s.sector === 'place'],
  ['#/culture', (s) => s.sector === 'culture'],
  ['#/spatial', (s) => s.sector === 'place'],
  ['#/index', (s) => s.view === 'index'],
  ['#/info', (s) => s.info],
  ['#/p/rgh', (s) => s.selected === 'rgh'],
  ['#/p/worthy', (s) => s.selected === 'worthy'],
  ['#/p/dopa/idea', (s) => s.selected === 'dopa' && s.depth === 'idea'],
]) {
  const { page, errors } = await fresh({ hash });
  const st = await page.evaluate(() => ({
    sector: world.sector,
    view: world.view,
    selected: world.selected,
    depth: world.depth,
    info: world.infoOpen,
    lock: world.lock,
  }));
  ok(`route:${hash}`, errors.length === 0 && !st.lock && check(st), JSON.stringify(st));
  await page.close();
}

/* ---- Showreel first entry ---- */
{
  const { page, errors } = await fresh({ intro: true });
  await sleep(400);
  const stage = await page.evaluate(() => {
    const s = document.querySelector('#introStage');
    const iframe = document.querySelector('#introReel iframe');
    return {
      hidden: s?.hidden,
      classes: document.body.className,
      iframe: iframe?.src || '',
      mark: document.querySelector('#introMark')?.textContent,
    };
  });
  ok('intro:active', !stage.hidden && /intro/.test(stage.classes) && stage.mark === 'TCC', JSON.stringify(stage));
  ok('intro:landscape-vf', /pr2tCO4nrU/.test(stage.iframe), stage.iframe);
  await page.click('#introEnter');
  await sleep(1200);
  const after = await page.evaluate(() => ({
    hidden: document.querySelector('#introStage')?.hidden,
    classes: document.body.className,
    seen: sessionStorage.getItem('tccIntro'),
    brandVis: getComputedStyle(document.querySelector('#brandBtn')).visibility,
  }));
  ok('intro:resolved', after.hidden && !/intro-tcc|intro-showreel/.test(after.classes) && after.seen === '1', JSON.stringify(after));
  ok('intro:console', errors.length === 0, errors.join('|'));

  /* no replay same session */
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  ok('intro:no-replay', await page.evaluate(() => document.querySelector('#introStage')?.hidden !== false));
  await page.close();
}

/* ---- Mobile showreel id + filters ---- */
{
  const { page } = await fresh({ intro: true, viewport: { width: 390, height: 844 } });
  await sleep(400);
  const src = await page.evaluate(() => document.querySelector('#introReel iframe')?.src || '');
  ok('intro:portrait-vf', /XnXvALPAMB/.test(src), src);
  await page.click('#introEnter');
  await sleep(1200);
  await page.evaluate(() => setFilter('culture'));
  await sleep(800);
  const occ = await page.evaluate(occProbe);
  ok('mobile:culture', occ.join(',') === OCC.culture, occ.join(','));
  ok('mobile:overflow', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.close();
}

/* ---- History back/forward smoke ---- */
{
  const { page } = await fresh();
  await page.evaluate(() => setFilter('place'));
  await sleep(800);
  await page.evaluate(() => openProject('microsoft'));
  await sleep(900);
  await page.goBack();
  await sleep(900);
  const back = await page.evaluate(() => ({ selected: world.selected, sector: world.sector }));
  ok('history:back', back.selected === null && back.sector === 'place', JSON.stringify(back));
  await page.close();
}

console.log('\n==== RC FULL LIBRARY ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.map((f) => ' - ' + f).join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
