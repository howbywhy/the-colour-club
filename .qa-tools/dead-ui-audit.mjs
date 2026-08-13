/** Real-browser audit: clock, hit-testing, lock, intro, click wiring. */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false, // closer to real Chrome; fall back if needed
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

async function audit(label, { clearStorage = false, hash = '' } = {}) {
  const page = await browser.newPage();
  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => errors.push({ t: Date.now(), type: 'pageerror', msg: String(e.message || e), stack: e.stack }));
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push({ t: Date.now(), type: 'console-error', msg: m.text() });
  });
  if (clearStorage) {
    await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch (e) {}
    });
  } else {
    await page.evaluateOnNewDocument(() => {
      try {
        sessionStorage.setItem('tccIntro', '1');
        sessionStorage.setItem('tccAllV', '1');
      } catch (e) {}
    });
  }
  const url = `http://127.0.0.1:8000/index.html?_=${Date.now()}${hash}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(clearStorage ? 2200 : 800);

  const report = await page.evaluate(() => {
    const hit = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 20);
      const y = r.top + Math.min(r.height / 2, 10);
      const top = document.elementFromPoint(x, y);
      return {
        sel,
        x,
        y,
        target: top ? `${top.tagName}#${top.id}.${top.className}` : null,
        targetId: top?.id || null,
        same: top === el || el.contains(top),
      };
    };
    const stage = document.querySelector('#introStage');
    const scs = stage ? getComputedStyle(stage) : null;
    const chrome = document.querySelector('#chrome');
    const ccs = getComputedStyle(chrome);
    return {
      clock: document.querySelector('#clock')?.textContent,
      lock: world.lock,
      selected: world.selected,
      sector: world.sector,
      last: world.last,
      introClass: document.body.classList.contains('intro-tcc'),
      chromeOp: ccs.opacity,
      chromePe: ccs.pointerEvents,
      stage: stage
        ? {
            hidden: stage.hidden,
            display: scs.display,
            op: scs.opacity,
            vis: scs.visibility,
            pe: scs.pointerEvents,
            z: scs.zIndex,
            rect: stage.getBoundingClientRect().toJSON(),
          }
        : null,
      hits: [
        hit('#brandBtn'),
        hit('#viewBtn'),
        hit('#filters .fbtn[data-f="hospitality"]'),
        hit('#infoBtn'),
      ],
      hasListeners: (() => {
        /* best-effort: click and see world change */
        return null;
      })(),
    };
  });

  /* Actual clicks */
  const clickResults = [];
  for (const sel of ['#viewBtn', '#filters .fbtn[data-f="hospitality"]', '#infoBtn', '#brandBtn']) {
    try {
      await page.click(sel, { delay: 20 });
      await sleep(400);
      const st = await page.evaluate(() => ({
        view: world.view,
        sector: world.sector,
        info: world.infoOpen,
        lock: world.lock,
        clock: document.querySelector('#clock')?.textContent,
      }));
      clickResults.push({ sel, ok: true, st });
      /* reset info if opened */
      if (st.info) {
        await page.click('#infoClose');
        await sleep(300);
      }
      if (st.view === 'index') {
        await page.click('#viewBtn');
        await sleep(400);
      }
      if (st.sector !== 'all') {
        await page.click('#filters .fbtn[data-f="all"]');
        await sleep(400);
      }
    } catch (e) {
      clickResults.push({ sel, ok: false, err: String(e.message || e) });
    }
  }

  const clock2 = await page.evaluate(() => document.querySelector('#clock')?.textContent);
  await sleep(1200);
  const clock3 = await page.evaluate(() => document.querySelector('#clock')?.textContent);

  const out = { label, errors, logs, report, clickResults, clock2, clock3, clockChanged: clock2 !== clock3 && clock3 !== '--:--:--' };
  await page.close();
  return out;
}

let results = [];
try {
  results.push(await audit('skip-intro', { clearStorage: false }));
  results.push(await audit('fresh-intro', { clearStorage: true }));
} catch (e) {
  console.error('AUDIT_ERR', e);
  /* retry headless */
  await browser.close();
  const browser2 = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  // reassign - simplify: just run headless inline
  globalThis.__b = browser2;
}

console.log(JSON.stringify(results, null, 2));
await browser.close().catch(() => {});
process.exit(0);
