/**
 * URL ↔ world reconciliation only.
 * Does not own animation. Quiet ops are lock-exempt.
 *
 * #/                      field, all
 * #/index                 index, all
 * #/<sector>              field, filtered
 * #/index/<sector>        index, filtered
 * #/p/<id>                project Images
 * #/p/<id>/idea           project Idea
 * … + /info
 */
import { world } from './worldState.js';

/**
 * @param {object} deps
 * @param {() => Record<string, object>} deps.getById
 * @param {string[]} deps.sectors
 * @param {() => {
 *   openProject:(id:string,quiet?:boolean)=>void,
 *   closeProject:(quiet?:boolean)=>void,
 *   setView:(v:string,quiet?:boolean)=>void,
 *   setFilter:(sec:string,quiet?:boolean)=>void,
 *   setDepth:(d:string,quiet?:boolean)=>void,
 *   lateral:(id:string,quiet?:boolean)=>void,
 *   openInfo:(quiet?:boolean)=>void,
 *   closeInfo:(then?:Function,quiet?:boolean)=>void,
 *   dbg?:()=>void,
 * }} deps.getActions
 */
export function createRouter({ getById, sectors, getActions }) {
  let expectHash = null;

  function syncHash() {
    let h = '#/';
    if (world.selected) {
      h = '#/p/' + world.selected;
      if (world.depth === 'idea') h += '/idea';
    } else {
      const seg = [];
      if (world.view === 'index') seg.push('index');
      if (world.sector !== 'all') seg.push(world.sector);
      h = '#/' + seg.join('/');
    }
    if (world.infoOpen) h += (h === '#/' ? 'info' : '/info');
    if (location.hash !== h) {
      expectHash = h;
      location.hash = h;
    }
  }

  function applyHash() {
    if (location.hash === expectHash) {
      expectHash = null;
      return;
    }
    const actions = getActions();
    const byId = getById();
    let h = location.hash.replace(/^#\/?/, '');
    const info = /(^|\/)info$/.test(h);
    h = h.replace(/\/?info$/, '');
    const m = h.match(/^p\/([a-z0-9]+)(\/idea)?$/);

    if (info && !world.infoOpen) actions.openInfo(true);
    if (!info && world.infoOpen) actions.closeInfo(null, true);

    if (m && byId[m[1]]) {
      if (world.selected && world.selected !== m[1]) actions.lateral(m[1], true);
      else if (!world.selected) actions.openProject(m[1], true);
      actions.setDepth(m[2] ? 'idea' : 'images', true);
    } else {
      if (world.selected) actions.closeProject(true);
      const parts = h.split('/').filter(Boolean);
      const wantsIndex = parts[0] === 'index';
      const sec = wantsIndex ? parts[1] : parts[0];
      actions.setView(wantsIndex ? 'index' : 'field', true);
      actions.setFilter(sectors.includes(sec) ? sec : 'all', true);
    }
    actions.dbg && actions.dbg();
  }

  function bind() {
    addEventListener('hashchange', applyHash);
  }

  return { syncHash, applyHash, bind };
}
