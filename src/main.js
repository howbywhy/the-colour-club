import { loadProjects } from './data/projects.js';
import { world, RM, D, $, acquire, release, withLock } from './state/worldState.js';
import { initAllVariant, setAllVariant as setAllVariantRaw } from './state/allVariant.js';
import { createRouter } from './state/routing.js';
import {
  TIMING,
  fly as flyRaw,
  flyCrop as flyCropRaw,
  flipTiles as flipTilesRaw,
  createFlightTable,
  endIntro,
} from './motion/transitions.js';
import { playTccIntro } from './motion/intro.js';
import { createProjectMedia } from './components/ProjectMedia.js';
import { createIndex } from './components/Index.js';
import { createProjectStack } from './components/ProjectStack.js';
import { createCollection } from './components/Collection.js';
import { createInfo } from './components/Info.js';
import { createChrome } from './components/Chrome.js';
import { bindAllSignups } from './components/Signup.js';
import { bindFaviconColour } from './components/FaviconColour.js';
import { createHueCursor } from './theme/palette.js';
import { saveViewScroll, resetModeY } from './state/scrollLedger.js';

/* Mutable flight hooks — window patches (QA) and lexical calls share one table. */
const { flights, fly, flyCrop } = createFlightTable(flyRaw, flyCropRaw);

let P, CAPS, CDN, byId;

/* ============================================================
   DATA — real TCC content, crawled 11 Aug 2026
   ============================================================ */
/* ============================================================
   WORLD — single source of truth
   ============================================================ */

export async function boot() {
  initAllVariant();
  const data = await loadProjects();
  CDN = data.cdn;
  CAPS = data.caps;
  P = data.projects;
byId={};P.forEach(p=>byId[p.id]=p);
const media = createProjectMedia({ cdn: CDN });
const {
  dimOf, alocal, aremote, setImg, imgTag, src0, aclass, classFromDim,
  applyHeroGeometry, bindClassify, sweep, galleryHtml,
} = media;
bindClassify();
/* Shared club palette cursor — outline / caps / stack */
const nextHue = createHueCursor();
bindFaviconColour();

/* ============================================================
   BUILD COLLECTION
   ============================================================ */
const grid=$('#colgrid');
function flipTiles(mutate,opts){ return flipTilesRaw(grid, mutate, opts); }
const index = createIndex({
  grid,
  getById: () => byId,
  media,
  nextHue,
  flipTiles,
  onDbg: () => dbg(),
});
const { attachPreview, sortIndex, bindSortHeaders } = index;

/* Routing bindings filled after action functions exist */
let syncHash = () => {};
let applyHash = () => {};

const collection = createCollection({
  grid,
  getById: () => byId,
  getProjects: () => P,
  media,
  attachPreview,
  openProject: (id) => openProject(id),
  syncHash: () => syncHash(),
  onDbg: () => dbg(),
});
const { filterCtrl, setFilter, buildTiles, bindFilters } = collection;
buildTiles();
/* index column order inside label when .x is active is handled by display:contents */

/* stack (archive during inspect) — 4:5 nav thumbs via CSS */
const stack=$('#stack');
const projectStack = createProjectStack({
  stackEl: stack,
  getProjects: () => P,
  media,
  nextHue,
  onLateral: (id) => lateral(id),
});
if (
  typeof projectStack.clearStack !== 'function' ||
  typeof projectStack.buildStack !== 'function' ||
  typeof projectStack.showStack !== 'function' ||
  typeof projectStack.hideStack !== 'function'
) {
  throw new Error('[tcc] ProjectStack API incomplete — expected buildStack/clearStack/showStack/hideStack');
}
/* Keep calls on the factory object — single owner, no stale destructure bindings. */
projectStack.clearStack();

const info = createInfo({
  syncHash: () => syncHash(),
  onDbg: () => dbg(),
});
const { openInfo, closeInfo, bindInfoChrome, buildCaps } = info;
buildCaps(CAPS, () => byId, nextHue, (id) => {
  world.selected ? lateral(id) : openProject(id);
});

/* ============================================================
   FLIP HELPERS — flipTiles bound above with Index
   ============================================================ */

/* ============================================================
   STATE TRANSITIONS
   ============================================================ */
function restoreViewScroll(v){
  const key = v === 'index' ? 'indexY' : 'fieldY';
  const preferred = world.ledger[key] || 0;
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      collection.clampWindowScroll(preferred);
    });
  });
}

function setView(v,quiet){
  if(world.view===v||world.selected)return;
  if(quiet){
    saveViewScroll();
    document.body.classList.toggle('x',v==='index');document.body.classList.toggle('g',v==='field');
    world.view=v;$('#viewBtn').textContent=v==='index'?'Visual':'Index';
    /* Index uses direct tile children; Visual Sector uses slot canvas */
    collection.syncSectorCanvas();
    collection.syncIndexFieldMin();
    restoreViewScroll(v);
    dbg();return;
  }
  endIntro();
  if(!withLock('view:'+world.view+'→'+v,()=>{
    saveViewScroll();
    flipTiles(()=>{
      document.body.classList.toggle('x',v==='index');
      document.body.classList.toggle('g',v==='field');
      collection.syncSectorCanvas();
    });
    world.view=v;
    $('#viewBtn').textContent = v==='index'?'Visual':'Index';
    collection.syncIndexFieldMin();
    restoreViewScroll(v);
    setTimeout(release,D(TIMING.view));
    syncHash(); dbg();
  })) return;
}

const SECTORS=['hospitality','fmcg','place','culture'];
/* Filters + gallery tiles owned by Collection (POSITIONING ≠ GALLERY). */
bindFilters();

function populateInspect(p){

  setImg($('#heroImg'),p,0);
  $('#mClient').textContent=p.name;
  $('#mStrap').textContent=p.strap;
  $('#mDeliv').innerHTML=p.deliv.join('<br>');
  $('#mCred').textContent=p.cred||'';$('#mCred').style.display=p.cred?'block':'none';
  $('#beats').innerHTML=`<div id="ideaLede">${p.lede||''}</div>`+
    p.beats.map(([k,tx],i)=>`<div class="beat s-${'abcde'[i]||'e'}"><div class="bk">${k}</div><p>${tx}</p></div>`).join('');
  $('#gal').innerHTML=galleryHtml(p);
  $('#mImages').classList.add('on');$('#mIdea').classList.remove('on');
  $('#mIdea').style.display=p.beats.length?'block':'none';
  projectStack.buildStack(p.id);
  applyHeroGeometry(p);
  const hero=$('#heroImg'); const hd=dimOf(p,0);
  if(hd){ hero.width=hd.width; hero.height=hd.height; }
  sweep($('#inspect'));
}

function openProject(id,quiet){
  if(world.selected)return;
  const p=byId[id];
  if(!p){ console.warn('[tcc] unknown project', id); return; }
  if(quiet){
    world.ledger[world.view+'Y']=scrollY;world.ledger.slot=id;resetModeY();
    document.body.classList.add('locked');document.body.classList.add('proj');
    populateInspect(p);
    const ins=$('#inspect');ins.classList.remove('idea');ins.scrollTop=0;
    const tile=grid.querySelector(`.tile[data-id="${id}"]`);
    applyHeroGeometry(p);
    if(tile)tile.style.visibility='hidden';
    $('#heroImg').style.opacity=1;ins.classList.add('open','ready');
    projectStack.showStack();$('#insClose').classList.add('show');
    world.selected=id;world.depth='images';dbg();return;
  }
  endIntro();
  if(world.lock)return;
  if(!withLock('open:'+id,()=>{
    const tile=grid.querySelector(`.tile[data-id="${id}"]`);
    const from=tile?tile.querySelector('.ph').getBoundingClientRect():null;
    const flysrc=tile?src0(tile):aremote(p,0);
    world.ledger[world.view+'Y']=scrollY; world.ledger.slot=id;
    document.body.classList.add('locked');document.body.classList.add('proj');
    resetModeY();
    const ins=$('#inspect');
    populateInspect(p);
    ins.classList.remove('idea');
    ins.scrollTop=0; ins.classList.add('open');
    applyHeroGeometry(p);
    const to=$('#insHero').getBoundingClientRect();
    $('#heroImg').style.opacity=0;
    if(tile)tile.style.visibility='hidden';
    fly(flysrc,from,to,D(TIMING.open),()=>{
      $('#heroImg').style.opacity=1;
      ins.classList.add('ready');
      projectStack.showStack(); $('#insClose').classList.add('show');
      world.selected=id;world.depth='images';release();
      syncHash(); dbg();
    });
  })) return;
}
function closeProject(quiet){
  if(!world.selected)return;
  if(quiet){
    const tile=grid.querySelector(`.tile[data-id="${world.selected}"]`);
    if(tile)tile.style.visibility='';
    document.body.classList.remove('locked','proj');
    const ins=$('#inspect');ins.classList.remove('open','ready','idea');
    /* Project inactive → stack must be non-present */
    projectStack.clearStack();$('#insClose').classList.remove('show');
    world.selected=null;world.depth='images';dbg();return;
  }
  if(world.lock)return;
  acquire();world.last='close:'+world.selected;
  const id=world.selected,p=byId[id];
  const ins=$('#inspect');
  const tile=grid.querySelector(`.tile[data-id="${id}"]`);
  /* Close owns the visual event: suppress stack immediately. Do not strip
     .idea yet — that would flash Images layout inside the still-open inspect. */
  ins.classList.remove('ready');
  document.body.classList.remove('proj');
  projectStack.hideStack();$('#insClose').classList.remove('show');
  const fromImages=world.depth!=='idea';
  const from=fromImages?$('#insHero').getBoundingClientRect():null;
  const flysrc=src0($('#insHero'));
  setTimeout(()=>{
    document.body.classList.remove('locked');       // scroll position was never destroyed
    const to=tile?tile.querySelector('.ph').getBoundingClientRect():null;
    /* Drop open + idea together so we never rest with stale .idea after close */
    ins.classList.remove('open','idea');
    fly(flysrc,from,fromImages?to:null,D(TIMING.close),()=>{
      if(tile)tile.style.visibility='';
      projectStack.clearStack();
      world.selected=null;world.depth='images';release();
      syncHash(); dbg();
    });
  },D(TIMING.closeFade));
}
function lateral(id,quiet){
  if(!world.selected||world.selected===id)return;
  const p=byId[id];
  if(!p){ console.warn('[tcc] unknown project', id); return; }
  if(quiet){
    const keep=world.depth;
    const old=grid.querySelector(`.tile[data-id="${world.selected}"]`);if(old)old.style.visibility='';
    world.ledger.slot=id;resetModeY();
    populateInspect(p);
    const ins=$('#inspect');ins.classList.toggle('idea',keep==='idea');
    $('#mIdea').classList.toggle('on',keep==='idea');$('#mImages').classList.toggle('on',keep!=='idea');
    ins.scrollTop=0;$('#heroImg').style.opacity=1;ins.classList.add('ready');
    const nt=grid.querySelector(`.tile[data-id="${id}"]`);if(nt)nt.style.visibility='hidden';
    world.selected=id;world.depth=keep;dbg();return;
  }
  if(world.lock)return;
  if(!withLock('lateral:'+world.selected+'→'+id,()=>{
    const oldTile=grid.querySelector(`.tile[data-id="${world.selected}"]`);
    if(oldTile)oldTile.style.visibility='';
    const sth=stack.querySelector(`.sth[data-id="${id}"]`);
    const from=sth?sth.getBoundingClientRect():null;
    const flysrc=sth?src0(sth):aremote(p,0);
    const keep=world.depth;
    const ins=$('#inspect');
    ins.classList.remove('ready');
    setTimeout(()=>{
      resetModeY();
      populateInspect(p);
      if(keep==='idea'){ins.classList.add('idea');$('#mIdea').classList.add('on');$('#mImages').classList.remove('on')}
      else ins.classList.remove('idea');
      ins.scrollTop=0;
      applyHeroGeometry(p);
      const to=$('#insHero').getBoundingClientRect();
      $('#heroImg').style.opacity=0;
      const nt=grid.querySelector(`.tile[data-id="${id}"]`); if(nt)nt.style.visibility='hidden';
      world.ledger.slot=id;
      flyCrop(flysrc,keep==='idea'?null:from,keep==='idea'?null:to,D(TIMING.lateral),()=>{
        $('#heroImg').style.opacity=1; ins.classList.add('ready');
        world.selected=id;world.depth=keep;release();
        syncHash(); dbg();
      });
    },D(TIMING.lateralFade));
  })) return;
}
function setDepth(d,quiet){
  if(!world.selected||world.depth===d)return;
  const ins=$('#inspect');
  if(world.ledger.modeY)world.ledger.modeY[world.depth]=ins.scrollTop;
  world.depth=d;world.last='depth:'+d;
  /* Idea/#story expands after class toggle — restore scroll once layout can accept it */
  const restoreY=()=>{
    const y=(world.ledger.modeY&&world.ledger.modeY[d])||0;
    ins.scrollTop=y;
    if(d==='idea'&&y>0&&Math.abs(ins.scrollTop-y)>1){
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ins.scrollTop=y;
        if(Math.abs(ins.scrollTop-y)>1) setTimeout(()=>{ins.scrollTop=y},D(TIMING.ideaRestore));
      }));
    }
  };
  if(quiet){
    ins.classList.toggle('idea',d==='idea');
    $('#mImages').classList.toggle('on',d==='images');
    $('#mIdea').classList.toggle('on',d==='idea');
    restoreY(); dbg();return;
  }
  ins.classList.remove('ready');
  setTimeout(()=>{
    ins.classList.toggle('idea',d==='idea');
    $('#mImages').classList.toggle('on',d==='images');
    $('#mIdea').classList.toggle('on',d==='idea');
    ins.classList.add('ready');
    restoreY();
  },D(TIMING.depth));
  if(!quiet)syncHash(); dbg();
}

/* ============================================================
   URL — hash routing (URL ↔ world; no animation ownership)
   ============================================================ */
const router = createRouter({
  getById: () => byId,
  sectors: SECTORS,
  getActions: () => ({
    openProject, closeProject, setView, setFilter, setDepth, lateral, openInfo, closeInfo, dbg,
  }),
});
syncHash = router.syncHash;
applyHash = router.applyHash;
addEventListener('hashchange', applyHash);

/* ============================================================
   CHROME + KEYS + CLOCK + DEBUG
   ============================================================ */
const chrome = createChrome({
  closeInfo,
  closeProject,
  setView,
  openInfo,
  setDepth,
  onToggleDbg: () => toggleDbg(),
});
chrome.bindChrome();
bindInfoChrome();
bindSortHeaders();
bindAllSignups();

/* debug */
let dbgOn=false;
function toggleDbg(){dbgOn=!dbgOn;$('#debug').classList.toggle('on',dbgOn);dbg()}
function dbg(){
  if(!dbgOn)return;
  const modeY=world.ledger.modeY||{};
  const animLive=[...grid.querySelectorAll('.tile')].reduce((n,t)=>n+(t.getAnimations?t.getAnimations().length:0),0);
  $('#debug').innerHTML=
`<span class="h">WORLD STATE</span>
allVariant  ${world.allVariant}
view        ${world.view}${world.sort?' (sort:'+world.sort+')':''}
sector      ${world.sector}
selected    ${world.selected||'null'}
depth       ${world.selected?world.depth:'—'}
infoOpen    ${world.infoOpen}
lock        ${world.lock}
last        ${world.last}
<span class="h">FILTER</span>
phase       ${filterCtrl.phase}
target      ${filterCtrl.target||'—'}
pending     — (latest-wins)
leavers     ${filterCtrl.leavers}
survivors   ${filterCtrl.survivors}
enterers    ${filterCtrl.enterers}
anims       ${filterCtrl.animCount} (live ${animLive})
<span class="h">LEDGER</span>
fieldY      ${Math.round(world.ledger.fieldY||0)}
indexY      ${Math.round(world.ledger.indexY||0)}
imagesY     ${Math.round(modeY.images||0)}
ideaY       ${Math.round(modeY.idea||0)}
slot        ${world.ledger.slot||'null'}
route       ${location.hash||'#/'}</span>`;
}

  /* debug / QA surface — same object as the module world, not a second state */
  window.world = world;
  window.openProject = openProject;
  window.closeProject = closeProject;
  window.setDepth = setDepth;
  window.setFilter = setFilter;
  window.filterCtrl = filterCtrl;
  window.setView = setView;
  window.openInfo = openInfo;
  window.closeInfo = closeInfo;
  window.lateral = lateral;
  window.endIntro = endIntro;
  window.setAllVariant = (n) => {
    setAllVariantRaw(n);
    collection.applyAllLayout();
  };
  Object.defineProperty(window, 'fly', {
    get() { return flights.fly; },
    set(fn) { flights.fly = fn; },
    configurable: true,
  });
  Object.defineProperty(window, 'flyCrop', {
    get() { return flights.flyCrop; },
    set(fn) { flights.flyCrop = fn; },
    configurable: true,
  });

  if (location.hash && location.hash !== '#/') applyHash();
  dbg();

  /*
   * Interaction + clock are already wired above.
   * Intro is cosmetic only — must never leave the site non-interactive.
   */
  try {
    await playTccIntro();
  } catch (err) {
    console.error('[tcc] intro', err);
  }
}
