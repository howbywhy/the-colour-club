/**
 * Phase 06.2 — typography, edges, Info, Idea, Index line, filter continuity.
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.TCC_URL || 'http://127.0.0.1:8000/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const consoleErr = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErr.push(m.text());
});
page.on('pageerror', (e) => consoleErr.push(String(e)));

await page.setViewport({ width: 1440, height: 900 });
await page.setRequestInterception(true);
const fontReqs = [];
const imgReqs = [];
page.on('request', (req) => {
  const u = req.url();
  const t = req.resourceType();
  if (t === 'font' || /Familjen|fonts\.google|googleapis/i.test(u)) fontReqs.push(u);
  if (t === 'image') imgReqs.push(u);
  req.continue();
});

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => sessionStorage.setItem('tccIntro', '1'));
await page.waitForSelector('#colgrid .tile');
await sleep(800);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
};

/* ---- 01 Typography ---- */
const fonts = await page.evaluate(() => {
  const pick = [
    'body',
    '#brandBtn',
    '#clock',
    '#filters .fbtn',
    '#viewBtn',
    '#infoBtn',
    '#linecell h1',
    '#linecell .sig',
    '.tile .nm',
    '.tile .st',
    '#ixhead button',
    '#signup-email-collection',
    '.signup button',
    '.signup input::placeholder',
  ];
  const out = {};
  for (const sel of pick) {
    if (sel.includes('::')) {
      // placeholder via input
      const el = document.querySelector('#signup-email-collection');
      const cs = getComputedStyle(el, '::placeholder');
      out[sel] = { ff: cs.fontFamily, fw: cs.fontWeight, fs: cs.fontSize };
      continue;
    }
    const el = document.querySelector(sel);
    if (!el) {
      out[sel] = null;
      continue;
    }
    const cs = getComputedStyle(el);
    out[sel] = { ff: cs.fontFamily, fw: cs.fontWeight, fs: cs.fontSize };
  }
  // sample all text-ish elements for non-Dia
  const bad = [];
  document.querySelectorAll('body, body *').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const tag = el.tagName;
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'BR', 'IMG', 'VIDEO', 'SOURCE', 'PATH', 'SVG'].includes(tag)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const ff = cs.fontFamily || '';
    if (!/Dia/i.test(ff) && !/ui-monospace|Menlo|Consolas|monospace/i.test(ff)) {
      bad.push({ tag, id: el.id, cls: el.className, ff });
    }
  });
  return { out, bad: bad.slice(0, 20), badCount: bad.length, fontReqs: [] };
});
fonts.fontReqs = fontReqs;
const nonDia = fonts.bad.filter((b) => !/debug/i.test(b.id || '') && !/debug/i.test(String(b.cls)));
check('Dia computed on UI samples', Object.values(fonts.out).every((v) => v && /Dia/i.test(v.ff)), fonts.out);
check('0 unintended non-Dia', nonDia.length === 0, { badCount: nonDia.length, sample: nonDia.slice(0, 5) });
check('No Familjen/Google font requests', !fontReqs.some((u) => /Familjen|fonts\.google/i.test(u)), fontReqs);

/* ---- 02 Signup ---- */
const signup = await page.evaluate(() => {
  const foot = document.querySelector('[data-foot="collection"]');
  const html = foot?.innerHTML || '';
  const input = document.querySelector('#signup-email-collection');
  const btn = foot?.querySelector('button[type="submit"]');
  const ics = getComputedStyle(input);
  const bcs = getComputedStyle(btn);
  const fr = foot.getBoundingClientRect();
  const ir = input.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const row = foot.querySelector('.signup-row');
  const rcs = getComputedStyle(row);
  return {
    hasJoinClub: /Join the club/i.test(html),
    hasInvite: /Occasional projects/i.test(html),
    inputFs: ics.fontSize,
    btnFs: bcs.fontSize,
    inputFw: ics.fontWeight,
    btnFw: bcs.fontWeight,
    inputFf: ics.fontFamily,
    btnFf: bcs.fontFamily,
    inputLh: ics.lineHeight,
    btnLh: bcs.lineHeight,
    bg: ics.backgroundColor,
    boxShadow: ics.boxShadow,
    outline: ics.outlineStyle,
    border: ics.border,
    footLeft: Math.round(fr.left),
    inputLeft: Math.round(ir.left),
    btnRight: Math.round(br.right),
    footRight: Math.round(fr.right),
    rowBorder: rcs.borderBottom,
    underline: rcs.borderBottomWidth + ' ' + rcs.borderBottomColor,
  };
});
check('Signup copy removed', !signup.hasJoinClub && !signup.hasInvite, signup);
check('Input/Join same type metrics', signup.inputFs === signup.btnFs && signup.inputFw === signup.btnFw && signup.inputLh === signup.btnLh, {
  inputFs: signup.inputFs,
  btnFs: signup.btnFs,
  fw: [signup.inputFw, signup.btnFw],
  lh: [signup.inputLh, signup.btnLh],
});
check('Signup transparent idle bg', signup.bg === 'rgba(0, 0, 0, 0)' || signup.bg === 'transparent', signup.bg);

await page.focus('#signup-email-collection');
const focusState = await page.evaluate(() => {
  const input = document.querySelector('#signup-email-collection');
  const ics = getComputedStyle(input);
  return { bg: ics.backgroundColor, boxShadow: ics.boxShadow, outline: ics.outline, outlineColor: ics.outlineColor };
});
check('Signup no blue box on focus', !/rgb\(.*\d+,\s*\d+,\s*2[0-9]{2}/.test(focusState.bg) && focusState.bg !== 'rgb(232, 240, 254)', focusState);

/* ---- 03 Edges ---- */
const edges = await page.evaluate(() => {
  const contentLeft = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return Math.round(r.left + parseFloat(cs.paddingLeft || 0));
  };
  const firstVisible = (sel) => {
    const els = [...document.querySelectorAll(sel)];
    return els.find((e) => e.getBoundingClientRect().width > 0) || els[0];
  };
  const chrome = document.querySelector('#chrome');
  const brand = document.querySelector('#brandBtn');
  const col = document.querySelector('#collection');
  const line = document.querySelector('#linecell');
  const tile = firstVisible('#colgrid .tile:not(.fhide)');
  const foot = document.querySelector('[data-foot="collection"] .signup-row');
  const pageEdge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-edge'));
  return {
    pageEdge,
    chromePad: parseFloat(getComputedStyle(chrome).paddingLeft),
    brandLeft: Math.round(brand.getBoundingClientRect().left),
    collectionContentLeft: contentLeft(col),
    linecellLeft: Math.round(line.getBoundingClientRect().left),
    tileLeft: Math.round(tile.getBoundingClientRect().left),
    signupLeft: Math.round(foot.getBoundingClientRect().left),
    colPadL: parseFloat(getComputedStyle(col).paddingLeft),
  };
});
const edgeAlign =
  edges.brandLeft === edges.pageEdge &&
  edges.linecellLeft === edges.pageEdge &&
  edges.signupLeft === edges.pageEdge &&
  edges.collectionContentLeft === edges.pageEdge;
check('Shared page edge (content)', edgeAlign, edges);

/* ---- 04 Info opening ---- */
await page.click('#infoBtn');
await sleep(400);
const info = await page.evaluate(() => {
  const voices = [...document.querySelectorAll('#info .info-voice')].map((el) => {
    const cs = getComputedStyle(el);
    return {
      text: el.textContent.slice(0, 40),
      fs: cs.fontSize,
      fw: cs.fontWeight,
      ff: cs.fontFamily,
      lh: cs.lineHeight,
      maxW: cs.maxWidth,
      w: Math.round(el.getBoundingClientRect().width),
    };
  });
  const h3 = document.querySelector('#info h3');
  const hcs = getComputedStyle(h3);
  const pad = document.querySelector('#info .pad');
  const pcs = getComputedStyle(pad);
  return {
    voices,
    sameSize: voices.length === 3 && voices.every((v) => v.fs === voices[0].fs),
    h3Fs: hcs.fontSize,
    h3Fw: hcs.fontWeight,
    padPL: pcs.paddingLeft,
    infoLeft: Math.round(pad.getBoundingClientRect().left + parseFloat(pcs.paddingLeft)),
  };
});
check('Info opening same size ×3', info.sameSize, info.voices);
check('Info opening Dia Light', info.voices.every((v) => /Dia/i.test(v.ff) && (v.fw === '300' || v.fw === 'light')), info.voices[0]);
check('Info opening larger than functional', parseFloat(info.voices[0].fs) > parseFloat(info.h3Fs), {
  voice: info.voices[0].fs,
  h3: info.h3Fs,
});
await page.keyboard.press('Escape');
await sleep(300);

/* ---- 05 Idea composition ---- */
await page.evaluate(() => {
  const t = document.querySelector('.tile[data-id="dopa"]');
  t && t.click();
});
await sleep(900);
await page.evaluate(() => typeof setDepth === 'function' && setDepth('idea'));
await sleep(500);
const idea = await page.evaluate(() => {
  const lede = document.querySelector('#ideaLede');
  const cs = getComputedStyle(lede);
  const beats = [...document.querySelectorAll('#inspect.idea .beat')].map((b) => {
    const r = b.getBoundingClientRect();
    const gcs = getComputedStyle(b);
    return { cls: b.className, left: Math.round(r.left), top: Math.round(r.top), col: gcs.gridColumn, maxW: getComputedStyle(b.querySelector('p') || b).maxWidth };
  });
  return {
    ledeFs: cs.fontSize,
    ledeFw: cs.fontWeight,
    ledeFf: cs.fontFamily,
    ledeMax: cs.maxWidth,
    ledeW: Math.round(lede.getBoundingClientRect().width),
    ledeCol: cs.gridColumn,
    beats,
  };
});
check('Idea lede Dia Light + wider measure', /Dia/i.test(idea.ledeFf) && (idea.ledeFw === '300' || idea.ledeFw === 'light') && parseFloat(idea.ledeMax) >= 20, idea);
await page.click('#insClose');
await sleep(700);

/* ---- 06 Index divider stability ---- */
await page.click('#viewBtn');
await sleep(500);
const lineStates = [];
for (const sec of ['all', 'hospitality', 'fmcg', 'spatial', 'all']) {
  await page.evaluate((s) => {
    const b = document.querySelector(`.fbtn[data-f="${s}"]`);
    b && b.click();
  }, sec);
  await sleep(350);
  const geom = await page.evaluate(() => {
    const h = document.querySelector('#ixhead');
    const cs = getComputedStyle(h);
    const r = h.getBoundingClientRect();
    return {
      borderBottom: cs.borderBottom,
      borderBottomWidth: cs.borderBottomWidth,
      borderBottomColor: cs.borderBottomColor,
      left: Math.round(r.left),
      width: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
    };
  });
  lineStates.push({ sec, ...geom });
}
const lineStable = lineStates.every(
  (s) =>
    s.borderBottomWidth === lineStates[0].borderBottomWidth &&
    s.borderBottomColor === lineStates[0].borderBottomColor &&
    s.left === lineStates[0].left &&
    s.width === lineStates[0].width
);
check('Index divider identical across filters', lineStable, lineStates);

/* ---- 07 Filter restore continuity ---- */
await page.click('#viewBtn'); // back to Visual
await sleep(400);
imgReqs.length = 0;
const restore = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tiles = [...document.querySelectorAll('#colgrid .tile')];
  tiles.forEach((t, i) => {
    t.dataset.keepId = 'k' + i;
  });
  const idsBefore = tiles.map((t) => t.dataset.keepId + ':' + t.dataset.id);
  const clickF = (s) => document.querySelector(`.fbtn[data-f="${s}"]`)?.click();

  clickF('hospitality');
  await sleep(400);
  const midIds = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.keepId + ':' + t.dataset.id);
  const midHidden = [...document.querySelectorAll('#colgrid .tile.fhide')].map((t) => t.dataset.id);
  const survivors = [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].map((t) => ({
    id: t.dataset.id,
    op: getComputedStyle(t).opacity,
  }));

  clickF('all');
  await sleep(200);
  const duringEnter = [...document.querySelectorAll('#colgrid .tile')].map((t) => ({
    id: t.dataset.id,
    keep: t.dataset.keepId,
    op: t.style.opacity || getComputedStyle(t).opacity,
    fhide: t.classList.contains('fhide'),
  }));
  await sleep(300);
  const afterIds = [...document.querySelectorAll('#colgrid .tile')].map((t) => t.dataset.keepId + ':' + t.dataset.id);
  const parentOp = getComputedStyle(document.querySelector('#collection')).opacity;
  const gridOp = getComputedStyle(document.querySelector('#colgrid')).opacity;
  return {
    sameDom: idsBefore.join() === afterIds.join() && idsBefore.join() === midIds.join(),
    midHiddenCount: midHidden.length,
    survivors,
    duringEnterSample: duringEnter.filter((t) => !t.fhide).slice(0, 8),
    parentOp,
    gridOp,
    stmt: (() => {
      const r = document.querySelector('#linecell').getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left) };
    })(),
  };
});
check('Tile DOM identity preserved', restore.sameDom, { midHidden: restore.midHiddenCount });
check('No parent/gallery fade', restore.parentOp === '1' && restore.gridOp === '1', {
  parentOp: restore.parentOp,
  gridOp: restore.gridOp,
});
check('No image network during restore', imgReqs.filter((u) => !u.includes('data:')).length === 0, imgReqs.slice(0, 5));

/* Rapid stress brief */
let rapidOk = true;
for (let i = 0; i < 40; i++) {
  const secs = ['all', 'hospitality', 'fmcg', 'spatial'];
  await page.evaluate((s) => document.querySelector(`.fbtn[data-f="${s}"]`)?.click(), secs[i % 4]);
  await sleep(40);
}
await sleep(500);
const settle = await page.evaluate(() => {
  const on = document.querySelector('.fbtn.on')?.dataset.f;
  const hash = location.hash;
  const blank = !document.querySelector('#colgrid .tile:not(.fhide)');
  const stuck = [...document.querySelectorAll('#colgrid .tile:not(.fhide)')].filter((t) => getComputedStyle(t).opacity === '0');
  return { on, hash, blank, stuck: stuck.map((t) => t.dataset.id), lock: world.lock };
});
rapidOk = !settle.blank && settle.stuck.length === 0 && !settle.lock;
check('Rapid filter settle', rapidOk, settle);

/* Mobile edge + Index line */
await page.setViewport({ width: 390, height: 844 });
await sleep(500);
await page.evaluate(() => {
  if (!document.body.classList.contains('x')) document.querySelector('#viewBtn')?.click();
});
await sleep(400);
const mobile = await page.evaluate(() => {
  const pe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-edge'));
  const brand = Math.round(document.querySelector('#brandBtn').getBoundingClientRect().left);
  const grid = document.querySelector('#colgrid');
  const gcs = getComputedStyle(grid);
  const states = [];
  return { pe, brand, gridBorderTop: gcs.borderTop, ixheadDisplay: getComputedStyle(document.querySelector('#ixhead')).display };
});
for (const sec of ['all', 'hospitality', 'spatial']) {
  await page.evaluate((s) => document.querySelector(`.fbtn[data-f="${s}"]`)?.click(), sec);
  await sleep(250);
  const g = await page.evaluate(() => {
    const grid = document.querySelector('#colgrid');
    const cs = getComputedStyle(grid);
    const r = grid.getBoundingClientRect();
    return { bt: cs.borderTop, left: Math.round(r.left), width: Math.round(r.width) };
  });
  mobile[sec] = g;
}
check(
  'Mobile Index structural top line stable',
  mobile.all.bt === mobile.hospitality.bt && mobile.all.bt === mobile.spatial.bt && mobile.all.width === mobile.spatial.width,
  mobile
);
check('Mobile edge retained', mobile.pe >= 12 && mobile.brand === mobile.pe, mobile);

console.log('\n--- SUMMARY ---');
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log({ pass, fail, consoleErr });
console.log(JSON.stringify({ edges, signup: { inputFs: signup.inputFs, underline: signup.underline }, infoVoice: info.voices[0], idea, lineOwner: lineStates[0] }, null, 2));

await browser.close();
process.exit(fail ? 1 : 0);
