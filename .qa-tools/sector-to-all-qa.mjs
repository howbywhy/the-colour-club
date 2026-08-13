/** Frame QA: Sector→All — no off-screen travel, no premature All flash. */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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

async function fresh() {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto('http://127.0.0.1:8000/index.html?_=' + Date.now(), { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof setFilter === 'function');
  await sleep(250);
  return page;
}

async function sampleReturn(sector) {
  const page = await fresh();
  await page.evaluate((s) => setFilter(s, true), sector);
  await sleep(200);
  const meta = await page.evaluate(() => ({
    scroll0: scrollY,
    allV0: document.body.getAttribute('data-all-v'),
  }));

  const frames = await page.evaluate(() => {
    return new Promise((resolve) => {
      const out = [];
      const start = performance.now();
      let armed = false;
      const tick = () => {
        if (!armed) return;
        const tiles = [...document.querySelectorAll('#colgrid .tile')];
        let maxTravelY = 0;
        let flyingOff = false;
        tiles.forEach((t) => {
          const tr = getComputedStyle(t).transform;
          let ty = 0;
          if (tr && tr !== 'none') {
            try {
              ty = new DOMMatrix(tr).m42;
            } catch (_) {}
          }
          maxTravelY = Math.max(maxTravelY, Math.abs(ty));
          if (Math.abs(ty) > 350) flyingOff = true;
        });
        const parents = ['#colgrid', '#galleryField', '#collection'].map(
          (sel) => getComputedStyle(document.querySelector(sel)).opacity
        );
        const ops = tiles.map((t) => Number(getComputedStyle(t).opacity));
        const shown = ops.filter((o) => o > 0.85).length;
        const prematureAll =
          !document.body.classList.contains('filtered') &&
          (filterCtrl.phase === 'flipping' || filterCtrl.phase === 'leaving') &&
          shown >= 3;
        out.push({
          phase: filterCtrl.phase,
          parents,
          maxTravelY: +maxTravelY.toFixed(1),
          flyingOff,
          prematureAll,
          shown,
          scrollY,
          allV: document.body.getAttribute('data-all-v'),
        });
        if ((filterCtrl.phase === 'idle' && performance.now() - start > 80) || performance.now() - start > 2400) {
          resolve(out);
          return;
        }
        requestAnimationFrame(tick);
      };
      armed = true;
      setFilter('all');
      requestAnimationFrame(tick);
    });
  });

  await sleep(100);
  const end = await page.evaluate(() => ({
    sector: world.sector,
    filtered: document.body.classList.contains('filtered'),
    lock: world.lock,
    phase: filterCtrl.phase,
    scrollY,
    allV: document.body.getAttribute('data-all-v'),
    visible: [...document.querySelectorAll('#colgrid .tile')].filter((t) => !t.classList.contains('fhide')).length,
  }));
  await page.close();
  return { frames, end, ...meta };
}

for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
  const { frames, end, scroll0, allV0 } = await sampleReturn(sec);
  ok(`${sec}:no-fly`, !frames.some((f) => f.flyingOff || f.maxTravelY > 350), `max=${Math.max(0, ...frames.map((f) => f.maxTravelY))}`);
  ok(`${sec}:no-flash`, !frames.some((f) => f.prematureAll), JSON.stringify(frames.filter((f) => f.prematureAll).slice(0, 2)));
  ok(`${sec}:no-parent-fade`, !frames.some((f) => f.parents.some((op) => op !== '1')));
  ok(`${sec}:scroll-stable`, !frames.some((f) => Math.abs(f.scrollY - scroll0) > 1) && end.scrollY === scroll0);
  ok(`${sec}:allV-stable`, !frames.some((f) => f.allV !== allV0) && end.allV === allV0);
  ok(`${sec}:settled-all`, end.sector === 'all' && !end.filtered && !end.lock && end.phase === 'idle' && end.visible === 15);
  console.log('  ', sec, 'frames', frames.length, 'phases', [...new Set(frames.map((f) => f.phase))].join('→'));
}

{
  const page = await fresh();
  for (const seq of [
    ['all', 'hospitality', 'all'],
    ['all', 'fmcg', 'all'],
    ['all', 'place', 'all'],
    ['hospitality', 'fmcg', 'place', 'culture', 'hospitality', 'all'],
    ['fmcg', 'all', 'hospitality', 'all', 'place', 'all', 'culture', 'all'],
  ]) {
    for (const s of seq) {
      await page.evaluate((x) => setFilter(x), s);
      await sleep(800);
    }
    const st = await page.evaluate(() => ({
      sector: world.sector,
      lock: world.lock,
      phase: filterCtrl.phase,
      filtered: document.body.classList.contains('filtered'),
      n: document.querySelectorAll('.tile').length,
    }));
    ok(`seq:${seq.join('>')}`, st.sector === 'all' && !st.lock && st.phase === 'idle' && !st.filtered && st.n === 15, JSON.stringify(st));
  }
  await page.close();
}

console.log('\n==== SECTOR→ALL QA ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
