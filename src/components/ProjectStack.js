/**
 * ProjectStack — desktop vertical / mobile horizontal 4:5 sibling navigation.
 * Max 8 candidates in a cyclic window around the active project.
 * Owns rendering, nav-thumb crop (CSS), hover colour, tip reveal, lateral activation.
 * Does not own selected project truth (world.selected).
 */
const STACK_WINDOW = 8;

export function createProjectStack({ stackEl, getProjects, media, nextHue, onLateral }) {
  const { imgTag } = media;

  /** Cyclic neighbours around active id — 4 before + 4 after, wrap, max 8. */
  function windowAround(exceptId) {
    const all = getProjects();
    const i = all.findIndex((p) => p.id === exceptId);
    if (i < 0) return all.slice(0, STACK_WINDOW);
    const n = all.length;
    const out = [];
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const p = all[(i + k + n * 4) % n];
      if (p && !out.some((x) => x.id === p.id)) out.push(p);
      if (out.length >= STACK_WINDOW) break;
    }
    return out.slice(0, STACK_WINDOW);
  }

  function buildStack(exceptId) {
    stackEl.innerHTML = '';
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = 'TCC';
    stackEl.appendChild(cap);
    windowAround(exceptId).forEach((p) => {
      const s = document.createElement('div');
      s.className = 'sth';
      s.dataset.id = p.id;
      s.innerHTML = `${imgTag(p, 0, 'alt=""')}<span class="tip">${p.name}</span>`;
      s.addEventListener('mouseenter', () => s.style.setProperty('--hue', nextHue()));
      s.addEventListener('click', () => onLateral(p.id));
      stackEl.appendChild(s);
    });
  }

  /** Tear down nav surface — no residual thumbs when project inactive. */
  function clearStack() {
    stackEl.innerHTML = '';
    stackEl.classList.remove('show');
    stackEl.setAttribute('aria-hidden', 'true');
  }

  function showStack() {
    stackEl.classList.add('show');
    stackEl.setAttribute('aria-hidden', 'false');
  }

  function hideStack() {
    stackEl.classList.remove('show');
    stackEl.setAttribute('aria-hidden', 'true');
  }

  /* Explicit public API — orchestration must use these, not ad-hoc DOM clears. */
  const api = {
    buildStack,
    clearStack,
    showStack,
    hideStack,
    el: stackEl,
    STACK_WINDOW,
  };
  return api;
}
