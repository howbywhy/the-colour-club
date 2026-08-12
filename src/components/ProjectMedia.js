/**
 * ProjectMedia — local-first paths, recorded dims, ratio classes, video/embed markup.
 * Primary presentation media remains uncropped / natural-ratio.
 * Navigation crops (4:5) are owned by Index / ProjectStack CSS.
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

  function applyHeroGeometry(p) {
    const IH = $('#insHero');
    IH.classList.remove('a-land', 'a-sq', 'a-port', 'a-deep');
    const d = dimOf(p, 0);
    if (d) {
      IH.style.aspectRatio = (d.width / d.height).toFixed(4);
      IH.classList.add(aclass(d.width, d.height));
    } else IH.style.aspectRatio = '1.68';
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
          : it.vf
            ? `<div class="gv"><iframe loading="lazy" src="https://app.vidzflow.com/v/${it.vf}?dq=576&ap=true&muted=true&loop=true&ctp=false&bc=%234E5FFD&controls=" allow="autoplay" title="Project film"></iframe></div>`
            : `<div class="gv"><video autoplay muted loop playsinline>${it.l ? `<source src="${it.l}">` : ''}${it.r ? `<source src="${it.r}">` : ''}</video></div>`
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
    applyHeroGeometry,
    classify,
    bindClassify,
    sweep,
    galleryHtml,
  };
}
