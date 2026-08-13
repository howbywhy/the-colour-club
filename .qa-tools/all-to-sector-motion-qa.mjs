/** Assert All→Sector is SECTOR_SETTLE-only; equal travel; regressions intact. */
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

async function fresh(w = 1440, h = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });
  await page.goto('http://127.0.0.1:8000/index.html?_=' + Date.now(), { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof setFilter === 'function');
  await sleep(200);
  return page;
}

const counts = { hospitality: 6, fmcg: 4, place: 4, culture: 1 };

for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
  const page = await fresh();
  await page.evaluate(() => setFilter('all', true));
  await sleep(80);
  const result = await page.evaluate(async (sector) => {
    const samples = [];
    const start = performance.now();
    setFilter(sector);
    await new Promise((resolve) => {
      const tick = () => {
        let maxTY = 0;
        document.querySelectorAll('#colgrid .sector-slot .tile').forEach((t) => {
          const tr = getComputedStyle(t).transform;
          if (tr && tr !== 'none') {
            try {
              maxTY = Math.max(maxTY, Math.abs(new DOMMatrix(tr).m42));
            } catch (_) {}
          }
        });
        samples.push({
          phase: filterCtrl.phase,
          maxTY: +maxTY.toFixed(1),
          modes: (filterCtrl.entryModes || []).slice(),
        });
        if ((filterCtrl.phase === 'idle' && performance.now() - start > 40) || performance.now() - start > 2200) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      modes: filterCtrl.entryModes || [],
      maxTY: Math.max(0, ...samples.map((s) => s.maxTY)),
      sector: world.sector,
      lock: world.lock,
    };
  }, sec);

  ok(`${sec}:count`, result.modes.length === counts[sec], String(result.modes.length));
  ok(
    `${sec}:all-SECTOR_SETTLE`,
    result.modes.every((m) => m.mode === 'SECTOR_SETTLE') && result.modes.length === counts[sec],
    JSON.stringify(result.modes)
  );
  ok(`${sec}:no-REAL_FLIP`, !result.modes.some((m) => m.mode === 'REAL_FLIP'));
  ok(`${sec}:no-FADE_ONLY`, !result.modes.some((m) => m.mode === 'FADE_ONLY'));
  ok(`${sec}:travel-bounded`, result.maxTY > 8 && result.maxTY <= 48, `maxTY=${result.maxTY}`);
  ok(`${sec}:settled`, result.sector === sec && !result.lock);
  console.log(' ', sec, 'maxTY', result.maxTY, JSON.stringify(result.modes.map((m) => m.id)));
  await page.close();
}

/* Equal grammar: maxTY should match across sectors (~40) */
{
  const travels = {};
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
    const page = await fresh();
    await page.evaluate(() => setFilter('all', true));
    travels[sec] = await page.evaluate(async (sector) => {
      let maxTY = 0;
      setFilter(sector);
      await new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          document.querySelectorAll('#colgrid .sector-slot .tile').forEach((t) => {
            const tr = getComputedStyle(t).transform;
            if (tr && tr !== 'none') {
              try {
                maxTY = Math.max(maxTY, Math.abs(new DOMMatrix(tr).m42));
              } catch (_) {}
            }
          });
          if (filterCtrl.phase === 'idle' || performance.now() - start > 1800) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return +maxTY.toFixed(1);
    }, sec);
    await page.close();
  }
  const vals = Object.values(travels);
  const spread = Math.max(...vals) - Math.min(...vals);
  ok('equal-travel-family', spread <= 8, JSON.stringify(travels) + ` spread=${spread}`);
}

/* Mobile */
{
  const page = await fresh(390, 844);
  await page.evaluate(() => setFilter('all', true));
  await page.evaluate(() => setFilter('hospitality'));
  await sleep(900);
  const st = await page.evaluate(() => ({
    modes: filterCtrl.entryModes || [],
    maxTY: 0,
  }));
  /* sample during next filter */
  await page.evaluate(() => setFilter('all', true));
  await sleep(200);
  const mob = await page.evaluate(async () => {
    let maxTY = 0;
    setFilter('fmcg');
    await new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        document.querySelectorAll('#colgrid .sector-slot .tile').forEach((t) => {
          const tr = getComputedStyle(t).transform;
          if (tr && tr !== 'none') {
            try {
              maxTY = Math.max(maxTY, Math.abs(new DOMMatrix(tr).m42));
            } catch (_) {}
          }
        });
        if (filterCtrl.phase === 'idle' || performance.now() - start > 1800) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      modes: filterCtrl.entryModes || [],
      maxTY: +maxTY.toFixed(1),
    };
  });
  ok(
    'mobile:SECTOR_SETTLE',
    mob.modes.every((m) => m.mode === 'SECTOR_SETTLE') && mob.modes.length === 4,
    JSON.stringify(mob.modes)
  );
  ok('mobile:offset~24', mob.maxTY > 8 && mob.maxTY <= 32, `maxTY=${mob.maxTY}`);
  await page.close();
}

/* Regressions + rapid */
{
  const page = await fresh();
  await page.evaluate(() => setFilter('hospitality', true));
  await sleep(80);
  await page.evaluate(() => setFilter('fmcg'));
  await sleep(1000);
  const secOcc = await page.evaluate(
    () =>
      [...document.querySelectorAll('#colgrid > .sector-slot')]
        .map((s) => s.querySelector('.tile')?.dataset.id || '')
        .join(',')
  );
  ok('sector→sector', secOcc === 'sub3,macabalm,willing,rgh,,', secOcc);
  for (const sec of ['hospitality', 'fmcg', 'place', 'culture']) {
    await page.evaluate((s) => setFilter(s), sec);
    await sleep(800);
    await page.evaluate(() => setFilter('all'));
    await sleep(850);
  }
  for (const s of ['hospitality', 'all', 'fmcg', 'all', 'place', 'all', 'culture', 'all']) {
    await page.evaluate((x) => setFilter(x), s);
    await sleep(700);
  }
  ok(
    'rapid-rest',
    await page.evaluate(() => world.sector === 'all' && filterCtrl.phase === 'idle' && !world.lock)
  );
  await page.close();
}

/* Responsive smoke */
for (const [w, h] of [
  [1180, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [375, 812],
]) {
  const page = await fresh(w, h);
  await page.evaluate(() => setFilter('all', true));
  await sleep(60);
  await page.evaluate(() => setFilter('place'));
  await sleep(1000);
  const st = await page.evaluate(() => ({
    modes: (filterCtrl.entryModes || []).map((m) => m.mode),
    sector: world.sector,
    lock: world.lock,
    occ: [...document.querySelectorAll('#colgrid > .sector-slot')]
      .map((s) => s.querySelector('.tile')?.dataset.id || '')
      .join(','),
  }));
  const pass =
    st.sector === 'place' &&
    !st.lock &&
    st.occ === 'microsoft,mesa,adela,aogc,,' &&
    st.modes.length === 4 &&
    st.modes.every((m) => m === 'SECTOR_SETTLE');
  ok(`${w}x${h}:place`, pass, JSON.stringify(st));
  await page.close();
}

console.log('\n==== SECTOR_SETTLE QA ====', fails.length ? 'FAIL' : 'PASS');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
