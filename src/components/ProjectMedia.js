/**
 * ProjectMedia — local-first paths, recorded dims, ratio classes, video/embed markup.
 * IMAGE / VIDEO / EMBED share one geometry model: source ratio → media frame → fill.
 * Navigation crops (4:5) are owned by Index / ProjectStack CSS only.
 */
import { $ } from '../state/worldState.js';

const LOCAL = 'public/images/projects/';

export function createProjectMedia({ cdn }) {
  const ext = (f) => f.slice(f.lastIndexOf('.'));
  const dimOf = (p, i) => (p.dims && p.dims[i]) || null;

  const alocal = (p, i) => {
    const m = p.media && p.media.filter((x) => x.type === 'image')[i];
    return (m && m.local) || (LOCAL + p.id + '/' + p.id + '-' + String(i + 1).padStart(2, '0') + ext(p.files[i]));
  };
  const aremote = (p, i) => {
    const m = p.media && p.media.filter((x) => x.type === 'image')[i];
    return (m && m.remote) || (cdn + p.files[i]);
  };

  function setImg(el, p, i) {
    const d = dimOf(p, i);
    if (d) {
      el.width = d.width;
      el.height = d.height;
    }
    el.dataset.remote = aremote(p, i);
    el.onerror = function () {
      this.onerror = null;
      this.src = this.dataset.remote;
    };
    el.src = alocal(p, i);
  }

  function imgTag(p, i, extra) {
    const d = dimOf(p, i);
    const wh = d ? ` width="${d.width}" height="${d.height}"` : '';
    return `<img ${extra || ''}${wh} src="${alocal(p, i)}" onerror="this.onerror=null;this.src='${aremote(p, i)}'">`;
  }

  const src0 = (el) => {
    const im = el.tagName === 'IMG' ? el : el.querySelector('img');
    return im.currentSrc || im.src;
  };

  const aclass = (w, h) => {
    const r = w / h;
    return r < 0.62 ? 'a-deep' : r < 0.85 ? 'a-port' : r <= 1.15 ? 'a-sq' : 'a-land';
  };
  const classFromDim = (p, i) => {
    const d = dimOf(p, i);
    return d ? aclass(d.width, d.height) : '';
  };

  /** Resolve source aspect for any media item (image dims, vid.w/h, vid.ar, or image proxy). */
  function aspectOfVid(p, v) {
    if (v && typeof v.ar === 'number' && v.ar > 0) return v.ar;
    if (v && v.w > 0 && v.h > 0) return v.w / v.h;
    const idx = typeof v?.at === 'number' ? Math.max(0, v.at - 1) : 0;
    const d = dimOf(p, idx) || dimOf(p, 0);
    if (d) return d.width / d.height;
    return null;
  }

  function ratioClass(ar) {
    if (!ar || !(ar > 0)) return 'a-land';
    return aclass(ar, 1);
  }

  /**
   * Available media rectangle inside the project viewer:
   * full viewport minus top pad, bottom breathing room, and stack rail when shown.
   */
  function viewerMediaBounds() {
    const root = getComputedStyle(document.documentElement);
    const inspect = $('#inspect');
    const ics = inspect ? getComputedStyle(inspect) : null;
    const edge = parseFloat(root.getPropertyValue('--page-edge')) || 17;
    const topPad =
      parseFloat(ics?.getPropertyValue('--inspect-pad-top')) ||
      parseFloat(ics?.paddingTop) ||
      84;
    const floor = parseFloat(ics?.getPropertyValue('--inspect-media-floor')) || 48;
    const stackGutter = parseFloat(ics?.getPropertyValue('--inspect-stack-gutter')) || 56;
    const stack = $('#stack');
    const stackOn =
      !!stack &&
      stack.classList.contains('show') &&
      getComputedStyle(stack).visibility !== 'hidden' &&
      Number(getComputedStyle(stack).opacity) > 0.05 &&
      !matchMedia('(max-width:767px)').matches;
    const availW = Math.max(160, window.innerWidth - edge * 2 - (stackOn ? stackGutter : 0));
    const availH = Math.max(160, window.innerHeight - topPad - floor);
    return { availW, availH, edge, topPad, floor };
  }

  /** Fit a media frame into availW × availH preserving aspect ratio (contain). */
  function fitMediaSize(ar, maxWCap) {
    const { availW, availH } = viewerMediaBounds();
    const capW = Math.min(availW, maxWCap > 0 ? maxWCap : availW);
    let w = capW;
    let h = w / ar;
    if (h > availH) {
      h = availH;
      w = h * ar;
    }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), ar, availW, availH };
  }

  function classMaxWidth(cls) {
    if (cls === 'a-deep') return 520;
    if (cls === 'a-port') return 640;
    if (cls === 'a-sq') return 720;
    return Infinity; /* landscape / wall — width limited by available viewer only */
  }

  /**
   * Size #insHero from source dims against BOTH available width and height.
   * Prevents full-bleed width from deriving a height taller than the viewport
   * (the Iced Tea clip: complete ratio, but bottom past the fold).
   */
  function applyHeroGeometry(p, mediaIndex = 0) {
    const IH = $('#insHero');
    if (!IH) return;
    IH.classList.remove('a-land', 'a-sq', 'a-port', 'a-deep');
    const d = dimOf(p, mediaIndex);
    const ar = d && d.width > 0 && d.height > 0 ? d.width / d.height : 1.68;
    const cls = d ? aclass(d.width, d.height) : 'a-land';
    IH.classList.add(cls);
    const { w, h } = fitMediaSize(ar, classMaxWidth(cls));
    IH.style.aspectRatio = ar.toFixed(4);
    IH.style.width = w + 'px';
    IH.style.height = h + 'px';
    IH.style.maxWidth = '100%';
  }

  function clearHeroGeometry() {
    const IH = $('#insHero');
    if (!IH) return;
    IH.style.width = '';
    IH.style.height = '';
    IH.style.aspectRatio = '';
    IH.style.maxWidth = '';
  }

  function classify(img) {
    if (!img.naturalWidth) return;
    const host = img.closest('.gi') || img.closest('.tile');
    if (host) host.classList.add(aclass(img.naturalWidth, img.naturalHeight));
  }

  function bindClassify() {
    document.addEventListener(
      'load',
      (e) => {
        if (e.target && e.target.tagName === 'IMG') classify(e.target);
      },
      true
    );
  }

  const sweep = (scope) =>
    scope.querySelectorAll('img').forEach((i) => {
      if (i.complete) classify(i);
    });

  /** Shared media-frame markup for video / embed — same ratio ownership as images. */
  function mediaFrameHtml(p, v) {
    const ar = aspectOfVid(p, v);
    const cls = ratioClass(ar);
    const arStyle = ar ? ` style="aspect-ratio:${Number(ar).toFixed(4)}"` : '';
    const inner = v.vf
      ? `<iframe loading="lazy" src="https://app.vidzflow.com/v/${v.vf}?dq=576&ap=true&muted=true&loop=true&ctp=false&bc=%234E5FFD&controls=" allow="autoplay" title="Project film"></iframe>`
      : `<video autoplay muted loop playsinline${v.w && v.h ? ` width="${v.w}" height="${v.h}"` : ''}>${
          v.l ? `<source src="${v.l}">` : ''
        }${v.r ? `<source src="${v.r}">` : ''}</video>`;
    return `<div class="gv media-frame ${cls}"${arStyle}>${inner}</div>`;
  }

  /** Gallery sequence markup for a project (images + optional video/embeds). */
  function galleryHtml(p) {
    const seq = [];
    const vv = p.vids || [];
    for (let i = 1; i < p.files.length; i++) {
      vv.filter((v) => v.at === i).forEach((v) => seq.push(v));
      seq.push(i);
    }
    vv.filter((v) => v.at >= p.files.length).forEach((v) => seq.push(v));
    return seq
      .map((it) =>
        typeof it === 'number'
          ? `<div class="gi ${classFromDim(p, it)}">${imgTag(p, it, 'loading="lazy" alt=""')}</div>`
          : mediaFrameHtml(p, it)
      )
      .join('');
  }

  return {
    dimOf,
    alocal,
    aremote,
    setImg,
    imgTag,
    src0,
    aclass,
    classFromDim,
    aspectOfVid,
    viewerMediaBounds,
    fitMediaSize,
    applyHeroGeometry,
    clearHeroGeometry,
    classify,
    bindClassify,
    sweep,
    galleryHtml,
    mediaFrameHtml,
  };
}
