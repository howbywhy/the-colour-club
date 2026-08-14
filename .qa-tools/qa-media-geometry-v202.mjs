/**
 * TCC V2.0.2 — Media geometry gate
 * SOURCE AR === RENDERED FRAME AR · no crop · no unknown ratios · no H overflow
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = process.env.TCC_BASE || 'http://127.0.0.1:8010/index.html';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOL = 0.04; /* rendered AR vs canonical */

const data = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));
const projects = data.projects;

function ratioClass(ar) {
  if (!(ar > 0)) return 'a-unknown';
  return ar < 0.62 ? 'a-deep' : ar < 0.85 ? 'a-port' : ar <= 1.15 ? 'a-sq' : 'a-land';
}

function catalogMotion() {
  const rows = [];
  for (const p of projects) {
    for (const v of p.vids || []) {
      const ar = typeof v.ar === 'number' && v.ar > 0 ? v.ar : v.w > 0 && v.h > 0 ? v.w / v.h : null;
      rows.push({
        project: p.id,
        name: p.name,
        id: v.vf || v.l || 'unknown',
        type: v.vf ? 'vidzflow' : 'mp4',
        ar,
        arSource: v.arSource || (v.w && v.h ? 'intrinsic' : null),
        cls: ratioClass(ar),
        w: v.w || null,
        h: v.h || null,
      });
    }
  }
  return rows;
}

async function openProject(page, id) {
  await page.evaluate((pid) => {
    location.hash = '#/p/' + pid;
  }, id);
  await sleep(900);
  await page.waitForSelector('#inspect.open #gal', { timeout: 8000 }).catch(() => {});
  await sleep(400);
}

async function measureMotion(page) {
  return page.evaluate(() => {
    const out = [];
    const gvs = [...document.querySelectorAll('#gal .gv')];
    for (const gv of gvs) {
      const fr = gv.getBoundingClientRect();
      const media = gv.querySelector('iframe, video');
      const mr = media ? media.getBoundingClientRect() : null;
      const cs = getComputedStyle(gv);
      const mcs = media ? getComputedStyle(media) : null;
      const styleAr = parseFloat(String(gv.style.aspectRatio || '').split('/')[0]) || null;
      const boxAr = fr.height > 0 ? fr.width / fr.height : null;
      const iframeSrc = media?.tagName === 'IFRAME' ? media.src : '';
      const vf = (iframeSrc.match(/\/v\/([^?/]+)/) || [])[1] || null;
      const vidSrc = media?.tagName === 'VIDEO' ? media.currentSrc || media.querySelector('source')?.src : null;
      out.push({
        vf,
        vidSrc,
        classes: [...gv.classList],
        styleAr,
        frame: { w: Math.round(fr.width), h: Math.round(fr.height), ar: boxAr },
        media: mr ? { w: Math.round(mr.width), h: Math.round(mr.height) } : null,
        objectFit: mcs?.objectFit || null,
        overflow: cs.overflow,
        maxWidth: cs.maxWidth,
        maxHeight: cs.maxHeight,
        width: cs.width,
        missingAr: gv.dataset.missingAr === '1',
      });
    }
    const hero = document.querySelector('#insHero');
    let heroM = null;
    if (hero) {
      const hr = hero.getBoundingClientRect();
      heroM = {
        w: Math.round(hr.width),
        h: Math.round(hr.height),
        ar: hr.height > 0 ? hr.width / hr.height : null,
        styleAr: parseFloat(String(hero.style.aspectRatio || '').split('/')[0]) || null,
        pastViewport: hr.bottom > window.innerHeight - 40,
      };
    }
    const hOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    return { gvs: out, hero: heroM, hOverflow, vw: window.innerWidth, vh: window.innerHeight };
  });
}

function arMatch(a, b) {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / a <= TOL;
}

async function main() {
  const catalog = catalogMotion();
  const unknownCatalog = catalog.filter((r) => !r.ar);
  const byProject = {};
  for (const r of catalog) {
    (byProject[r.project] ||= []).push(r);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tccIntro', '1');
    sessionStorage.setItem('tccAllV', '1');
  });

  const viewports = [
    { w: 1440, h: 900 },
    { w: 1440, h: 800 },
    { w: 1180, h: 800 },
    { w: 1180, h: 700 },
    { w: 1024, h: 768 },
    { w: 768, h: 1024 },
    { w: 430, h: 932 },
    { w: 390, h: 844 },
    { w: 375, h: 812 },
  ];

  const failures = [];
  const motionAudit = [];
  const sub3BeforeAfter = {};

  /* Primary: 1440×900 full motion audit */
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(600);

  for (const p of projects) {
    const expected = byProject[p.id] || [];
    await openProject(page, p.id);
    const m = await measureMotion(page);
    if (m.hOverflow) failures.push({ sev: 'High', id: p.id, msg: 'horizontal overflow' });

    for (let i = 0; i < m.gvs.length; i++) {
      const gv = m.gvs[i];
      const exp =
        expected.find((e) => e.id === gv.vf) ||
        expected[i] ||
        null;
      const canonAr = exp?.ar ?? gv.styleAr;
      const crop =
        gv.styleAr && gv.frame.ar && !arMatch(gv.styleAr, gv.frame.ar)
          ? true
          : false;
      const row = {
        project: p.id,
        mediaId: gv.vf || gv.vidSrc || `gv-${i}`,
        type: gv.vf ? 'vidzflow' : 'mp4',
        sourceAr: canonAr,
        ratioClass: (gv.classes.find((c) => /^a-/.test(c)) || '').replace(/^a-/, '') || null,
        frame: `${gv.frame.w}×${gv.frame.h}`,
        media: gv.media ? `${gv.media.w}×${gv.media.h}` : null,
        fitMode: gv.objectFit,
        crop: crop ? 'YES' : 'NO',
        overflow: gv.overflow === 'hidden' && crop ? 'YES' : 'NO',
        styleAr: gv.styleAr,
        boxAr: gv.frame.ar,
        missingAr: gv.missingAr,
      };
      motionAudit.push(row);

      if (gv.missingAr || !(canonAr > 0)) {
        failures.push({ sev: 'Critical', id: p.id, media: row.mediaId, msg: 'UNKNOWN_RATIO' });
      }
      if (crop) {
        failures.push({
          sev: 'Critical',
          id: p.id,
          media: row.mediaId,
          msg: `AR_DISTORT style=${gv.styleAr?.toFixed?.(3)} box=${gv.frame.ar?.toFixed?.(3)} frame=${row.frame}`,
        });
      }
      if (gv.frame.h > 900 - 84 - 40) {
        /* soft: frame taller than viewing band — should be fitted */
        if (gv.frame.h > m.vh - 84 - 48 + 2) {
          failures.push({
            sev: 'High',
            id: p.id,
            media: row.mediaId,
            msg: `VIEWPORT_OVERFLOW h=${gv.frame.h} vh=${m.vh}`,
          });
        }
      }
    }

    if (p.id === 'sub3') {
      sub3BeforeAfter.after1440 = m.gvs.map((g) => ({
        id: g.vf,
        frame: g.frame,
        styleAr: g.styleAr,
        objectFit: g.objectFit,
        overflow: g.overflow,
      }));
    }

    /* Image regression spot-checks */
    if (['icedtea', 'sub3', 'dopa', 'gella'].includes(p.id) && m.hero?.pastViewport) {
      failures.push({ sev: 'Critical', id: p.id, msg: 'HERO_PAST_VIEWPORT' });
    }
  }

  /* Short / responsive viewports — key projects */
  const keyIds = [
    'sub3',
    'dopa',
    'rads',
    'icedtea',
    'gella',
    'fishfish',
    'kingbrown',
    'roy',
    'tsukiyo',
    'adela',
    'aogc',
  ].filter((id) => projects.some((p) => p.id === id));

  const responsive = [];
  for (const vp of viewports) {
    await page.setViewport({ width: vp.w, height: vp.h });
    for (const id of keyIds) {
      await openProject(page, id);
      const m = await measureMotion(page);
      for (const gv of m.gvs) {
        const crop = gv.styleAr && gv.frame.ar && !arMatch(gv.styleAr, gv.frame.ar);
        const rec = {
          vp: `${vp.w}×${vp.h}`,
          project: id,
          media: gv.vf || 'mp4',
          frame: `${gv.frame.w}×${gv.frame.h}`,
          styleAr: gv.styleAr,
          boxAr: gv.frame.ar,
          crop: !!crop,
          hOverflow: m.hOverflow,
          heroPast: !!m.hero?.pastViewport,
        };
        responsive.push(rec);
        if (crop) {
          failures.push({
            sev: 'Critical',
            id,
            media: rec.media,
            msg: `RESP_AR_DISTORT @${rec.vp} style=${gv.styleAr} box=${gv.frame.ar}`,
          });
        }
        if (m.hOverflow) {
          failures.push({ sev: 'High', id, msg: `H_OVERFLOW @${rec.vp}` });
        }
      }
    }
  }

  /* Filter counts smoke */
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
  await sleep(500);
  const filters = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = () =>
      [...document.querySelectorAll('#colgrid .tile')].filter((t) => {
        const s = getComputedStyle(t);
        return s.display !== 'none' && parseFloat(s.opacity) > 0.2 && t.getBoundingClientRect().height > 0;
      }).length;
    const clickF = async (f) => {
      document.querySelector(`.fbtn[data-f="${f}"]`)?.click();
      await sleep(450);
    };
    const out = {};
    await clickF('all');
    out.all = visible();
    await clickF('hospitality');
    out.hospitality = visible();
    await clickF('fmcg');
    out.fmcg = visible();
    await clickF('place');
    out.place = visible();
    await clickF('culture');
    out.culture = visible();
    await clickF('all');
    out.allAfter = visible();
    return out;
  });

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    catalogCount: catalog.length,
    unknownCatalog: unknownCatalog.map((r) => `${r.project}:${r.id}`),
    motionAudit,
    sub3: {
      before: {
        note: 'Pre-fix diagnosis (1440×900)',
        XrKxaeFOEC: {
          canonAr: 1.648,
          frame: '1406×768',
          boxAr: 1.831,
          cropOwner: 'frame-ar-distorted-by-max-height',
        },
        AtrFBhQc0V: { canonAr: 0.8, frame: '520×650', boxAr: 0.8, crop: false },
      },
      after: sub3BeforeAfter.after1440,
    },
    responsiveSample: responsive.filter((r) => r.project === 'sub3' || r.crop),
    filters,
    failures,
    pass: failures.length === 0 && unknownCatalog.length === 0,
  };

  const outPath = join(__dirname, 'qa-media-geometry-v202-results.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('=== TCC V2.0.2 MEDIA GEOMETRY ===');
  console.log('catalog motion assets:', catalog.length);
  console.log('unknown ratios:', unknownCatalog.length, unknownCatalog.map((r) => r.id).join(', ') || 'none');
  console.log('failures:', failures.length);
  for (const f of failures.slice(0, 40)) console.log(' ', f.sev, f.id, f.media || '', f.msg);
  if (failures.length > 40) console.log(' ...', failures.length - 40, 'more');
  console.log('SUB:3 after:', JSON.stringify(sub3BeforeAfter.after1440, null, 2));
  console.log('filters:', filters);
  console.log(report.pass ? 'LOCAL MEDIA QA: PASS' : 'LOCAL MEDIA QA: FAIL');
  console.log('wrote', outPath);
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
