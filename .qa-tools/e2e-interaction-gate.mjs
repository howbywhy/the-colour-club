/**
 * E2E gate — click the rendered interface, assert visible world state.
 * Not a helper-only smoke test.
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

const failures = [];
const ok = (name, cond, detail = '') => {
  if (!cond) failures.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(cond ? 'PASS' : 'FAIL', name, detail);
};

async function freshPage(hash = '') {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && /boot failed|TypeError|ReferenceError|Failed to load module/i.test(m.text())) {
      errors.push(m.text());
    }
  });
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('tccIntro', '1');
      sessionStorage.setItem('tccAllV', '1');
    } catch (_) {}
  });
  await page.goto(`${BASE}?_=${Date.now()}${hash}`, { waitUntil: 'networkidle0', timeout: 25000 });
  await page.waitForFunction(() => typeof window.world === 'object' && document.querySelector('#clock')?.textContent !== '--:--:--', {
    timeout: 10000,
  });
  await sleep(200);
  return { page, errors };
}

async function clickSel(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  await page.click(sel);
}

/* ---- homepage interaction matrix ---- */
{
  const { page, errors } = await freshPage();
  ok('boot-no-uncaught', errors.length === 0, errors.join(' | '));

  const clock0 = await page.$eval('#clock', (el) => el.textContent);
  ok('clock-immediate', clock0 !== '--:--:--' && /\d/.test(clock0), clock0);
  await sleep(1100);
  const clock1 = await page.$eval('#clock', (el) => el.textContent);
  ok('clock-ticks', clock1 !== clock0, `${clock0} → ${clock1}`);

  const hits = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + 8, r.top + 8);
      return { sel, id: top?.id || top?.className, ok: el === top || el.contains(top) };
    };
    return [probe('#brandBtn'), probe('#viewBtn'), probe('#filters .fbtn[data-f="hospitality"]'), probe('#infoBtn')];
  });
  hits.forEach((h) => ok(`hit:${h.sel}`, h.ok, h.id));

  const stage = await page.evaluate(() => {
    const s = document.querySelector('#introStage');
    const cs = getComputedStyle(s);
    return {
      hidden: s.hidden,
      pe: cs.pointerEvents,
      display: cs.display,
      introClass: document.body.classList.contains('intro-tcc'),
      lock: world.lock,
    };
  });
  ok('intro-torn-down', stage.hidden && stage.pe === 'none' && stage.display === 'none' && !stage.introClass);
  ok('lock-idle', stage.lock === false);

  await clickSel(page, '#viewBtn');
  await sleep(500);
  ok('click-Index', await page.evaluate(() => world.view === 'index'));
  await clickSel(page, '#viewBtn');
  await sleep(500);
  ok('click-Visual', await page.evaluate(() => world.view === 'field'));

  for (const f of ['hospitality', 'fmcg', 'place', 'culture', 'all']) {
    await clickSel(page, `#filters .fbtn[data-f="${f}"]`);
    await sleep(700);
    const st = await page.evaluate(() => ({ sector: world.sector, lock: world.lock, phase: filterCtrl.phase }));
    ok(`filter-${f}`, st.sector === f && st.lock === false && st.phase === 'idle', JSON.stringify(st));
  }

  /* cycle A */
  for (const f of ['hospitality', 'fmcg', 'place', 'culture', 'all']) {
    await clickSel(page, `#filters .fbtn[data-f="${f}"]`);
    await sleep(650);
  }
  ok('cycle-A-rest', await page.evaluate(() => world.sector === 'all' && !world.lock));

  /* cycle B */
  for (const f of ['place', 'hospitality', 'all', 'fmcg', 'culture', 'place', 'all']) {
    await clickSel(page, `#filters .fbtn[data-f="${f}"]`);
    await sleep(650);
  }
  ok('cycle-B-rest', await page.evaluate(() => world.sector === 'all' && !world.lock));

  await clickSel(page, '#infoBtn');
  await sleep(400);
  ok('info-open', await page.evaluate(() => world.infoOpen === true));
  /* Info chrome Close control (not the nav Info toggle) */
  await page.waitForSelector('#infoClose', { visible: true, timeout: 5000 });
  await page.$eval('#infoClose', (el) => el.click());
  await sleep(450);
  ok('info-close', await page.evaluate(() => world.infoOpen === false));

  /* project → idea → close stack invariant */
  await page.evaluate(() => openProject('sub3'));
  await sleep(900);
  ok('project-open', await page.evaluate(() => world.selected === 'sub3'));
  await clickSel(page, '#mIdea');
  await sleep(500);
  ok('idea', await page.evaluate(() => world.depth === 'idea'));
  await clickSel(page, '#insClose');
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
    'stack-clear-after-idea-close',
    stack.selected === null && !stack.show && stack.op === '0' && stack.vis === 'hidden' && stack.pe === 'none' && stack.kids === 0,
    JSON.stringify(stack)
  );

  await page.evaluate(() => openProject('sub3'));
  await sleep(900);
  const n = await page.evaluate(() => document.querySelectorAll('#stack .sth').length);
  ok('stack-rebuild-8', n === 8, String(n));
  await page.evaluate(() => closeProject());
  await sleep(1100);

  await page.close();
}

/* ---- route matrix ---- */
for (const hash of ['', '#/index', '#/hospitality', '#/index/hospitality', '#/p/sub3', '#/p/sub3/idea', '#/info']) {
  const { page, errors } = await freshPage(hash);
  const st = await page.evaluate(() => ({
    clock: document.querySelector('#clock')?.textContent,
    lock: world.lock,
    intro: document.body.classList.contains('intro-tcc'),
    stageHidden: document.querySelector('#introStage')?.hidden,
    selected: world.selected,
    view: world.view,
    sector: world.sector,
    info: world.infoOpen,
    depth: world.depth,
  }));
  ok(`route${hash || '/'}-console`, errors.length === 0, errors.join(' | '));
  ok(`route${hash || '/'}-no-intro`, !st.intro && st.stageHidden);
  ok(`route${hash || '/'}-lock`, st.lock === false);
  if (!hash.includes('/p/')) {
    ok(`route${hash || '/'}-clock`, st.clock && st.clock !== '--:--:--', st.clock);
  }
  await page.close();
}

/* ---- intro finally: interrupt showreel mid-entry via endIntro ---- */
{
  const page = await browser.newPage();
  await page.goto(`${BASE}?_=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
    } catch (_) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof world === 'object' && document.querySelector('#introEnter'));
  await sleep(300);
  ok(
    'intro-showreel-armed',
    await page.evaluate(
      () =>
        document.body.classList.contains('intro-showreel') &&
        !document.querySelector('#introStage')?.hidden &&
        !!document.querySelector('#introReel iframe')
    )
  );
  /* Interrupt mid-entry — same teardown filters/projects use */
  await page.waitForFunction(() => typeof endIntro === 'function');
  await page.evaluate(() => endIntro());
  await sleep(200);
  const after = await page.evaluate(() => {
    const chrome = document.querySelector('#chrome');
    const stage = document.querySelector('#introStage');
    return {
      clock: document.querySelector('#clock')?.textContent,
      chromeOp: getComputedStyle(chrome).opacity,
      chromeInline: chrome.style.opacity,
      intro: document.body.classList.contains('intro-tcc') || document.body.classList.contains('intro-showreel'),
      stageHidden: stage.hidden,
      pe: getComputedStyle(stage).pointerEvents,
      lock: world.lock,
    };
  });
  ok(
    'intro-interrupt-restored',
    after.chromeOp === '1' && !after.chromeInline && !after.intro && after.stageHidden && after.pe === 'none',
    JSON.stringify(after)
  );
  ok('intro-interrupt-clock', after.clock !== '--:--:--', after.clock);
  await page.evaluate(() => setFilter('fmcg'));
  await sleep(800);
  ok('intro-interrupt-filter', await page.evaluate(() => world.sector === 'fmcg'));
  await page.close();
}

console.log('\n==== E2E GATE ====', failures.length ? 'FAIL' : 'PASS');
if (failures.length) {
  console.log(failures.join('\n'));
  await browser.close();
  process.exit(1);
}
await browser.close();
process.exit(0);
