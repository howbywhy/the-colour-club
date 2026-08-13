/** Final local release-candidate audit (post Sector→All fix). */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8000/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});

const fails = [];
const ok = (n, c, d = '') => {
  if (!c) fails.push(`${n}${d ? ': ' + d : ''}`);
  console.log(c ? 'PASS' : 'FAIL', n, d);
};

async function fresh(hash = '') {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto(`${BASE}?_=${Date.now()}${hash}`, { waitUntil: 'networkidle0', timeout: 25000 });
  await page.waitForFunction(() => typeof world === 'object');
  await sleep(300);
  return { page, errors };
}

/* URL reachability */
{
  for (const path of ['/', '/index.html', '/index.html#/', '/index.html#/hospitality', '/index.html#/fmcg', '/index.html#/place', '/index.html#/culture']) {
    const res = await fetch('http://127.0.0.1:8000' + path.replace(/#.*$/, ''));
    ok(`http:${path.split('#')[0]}`, res.status === 200, String(res.status));
  }
}

/* Core interaction + stack */
{
  const { page, errors } = await fresh();
  ok('console-clean', errors.length === 0, errors.join('|'));
  ok('clock', await page.$eval('#clock', (el) => el.textContent !== '--:--:--'));
  await page.click('#filters .fbtn[data-f="hospitality"]');
  await sleep(700);
  await page.click('#filters .fbtn[data-f="all"]');
  await sleep(900);
  ok('hosp→all', await page.evaluate(() => world.sector === 'all' && !document.body.classList.contains('filtered')));
  await page.evaluate(() => openProject('sub3'));
  await sleep(1000);
  await page.click('#mIdea');
  await sleep(400);
  await page.click('#insClose');
  await sleep(1100);
  const stack = await page.evaluate(() => {
    const s = document.querySelector('#stack');
    const cs = getComputedStyle(s);
    return {
      selected: world.selected,
      show: s.classList.contains('show'),
      kids: s.children.length,
      pe: cs.pointerEvents,
      vis: cs.visibility,
    };
  });
  ok('stack-clear', stack.selected === null && !stack.show && stack.kids === 0 && stack.pe === 'none', JSON.stringify(stack));
  await page.click('#infoBtn');
  await sleep(400);
  ok('info', await page.evaluate(() => world.infoOpen));
  await page.evaluate(() => closeInfo());
  await sleep(300);
  await page.close();
}

/* Sector canvas intact */
{
  const { page } = await fresh();
  await page.evaluate(() => setFilter('hospitality', true));
  let occ = await page.evaluate(() =>
    [...document.querySelectorAll('#colgrid > .sector-slot')].map((s) => s.querySelector('.tile')?.dataset.id || null)
  );
  ok('canvas-hosp', occ.join() === 'dopa,fishfish,roy,gella,lucky,tsukiyo', occ.join());
  await page.evaluate(() => setFilter('fmcg'));
  await sleep(700);
  occ = await page.evaluate(() =>
    [...document.querySelectorAll('#colgrid > .sector-slot')].map((s) => s.querySelector('.tile')?.dataset.id || null)
  );
  ok('canvas-fmcg', occ.join() === 'sub3,macabalm,willing,rgh,,', occ.join(','));
  await page.evaluate(() => setFilter('place'));
  await sleep(700);
  occ = await page.evaluate(() =>
    [...document.querySelectorAll('#colgrid > .sector-slot')].map((s) => s.querySelector('.tile')?.dataset.id || null)
  );
  ok('canvas-place', occ.join() === 'microsoft,mesa,adela,aogc,,', occ.join(','));
  await page.evaluate(() => setFilter('culture'));
  await sleep(700);
  occ = await page.evaluate(() =>
    [...document.querySelectorAll('#colgrid > .sector-slot')].map((s) => s.querySelector('.tile')?.dataset.id || null)
  );
  ok('canvas-culture', occ.join() === 'worthy,,,,,', occ.join(','));
  await page.close();
}

/* Routes */
for (const [hash, check] of [
  ['#/', (s) => s.sector === 'all' && !s.selected],
  ['#/hospitality', (s) => s.sector === 'hospitality'],
  ['#/fmcg', (s) => s.sector === 'fmcg'],
  ['#/place', (s) => s.sector === 'place'],
  ['#/culture', (s) => s.sector === 'culture'],
  ['#/spatial', (s) => s.sector === 'place'],
  ['#/index', (s) => s.view === 'index'],
  ['#/info', (s) => s.info],
  ['#/p/sub3', (s) => s.selected === 'sub3'],
]) {
  const { page, errors } = await fresh(hash);
  const st = await page.evaluate(() => ({
    sector: world.sector,
    view: world.view,
    selected: world.selected,
    info: world.infoOpen,
    lock: world.lock,
  }));
  ok(`route:${hash}`, errors.length === 0 && !st.lock && check(st), JSON.stringify(st));
  await page.close();
}

/* Responsive smoke */
for (const [w, h] of [
  [1180, 800],
  [768, 1024],
  [390, 844],
]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'networkidle0' });
  await sleep(300);
  await page.evaluate(() => setFilter('fmcg'));
  await sleep(600);
  await page.evaluate(() => setFilter('all'));
  await sleep(800);
  const st = await page.evaluate(() => ({
    sector: world.sector,
    lock: world.lock,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  ok(`resp:${w}x${h}`, st.sector === 'all' && !st.lock && !st.overflow, JSON.stringify(st));
  await page.close();
}

/* Typography Dia signal */
{
  const { page } = await fresh();
  const fonts = await page.evaluate(() => {
    const pick = (sel) => getComputedStyle(document.querySelector(sel)).fontFamily;
    return { h1: pick('#linecell h1'), chrome: pick('#brandBtn'), infoBtn: pick('#infoBtn') };
  });
  ok(
    'dia-type',
    Object.values(fonts).every((f) => /Dia/i.test(f)),
    JSON.stringify(fonts)
  );
  await page.close();
}

console.log('\n==== RC AUDIT ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
