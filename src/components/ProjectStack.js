/**
 * ProjectStack — desktop vertical / mobile horizontal 4:5 sibling navigation.
 * Owns rendering, nav-thumb crop (CSS), hover colour, tip reveal, lateral activation.
 * Does not own selected project truth (world.selected).
 */
export function createProjectStack({ stackEl, getProjects, media, nextHue, onLateral }) {
  const { imgTag } = media;

  function buildStack(exceptId) {
    stackEl.innerHTML = '';
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = 'TCC';
    stackEl.appendChild(cap);
    getProjects()
      .filter((p) => p.id !== exceptId)
      .forEach((p) => {
        const s = document.createElement('div');
        s.className = 'sth';
        s.dataset.id = p.id;
        s.innerHTML = `${imgTag(p, 0, 'alt=""')}<span class="tip">${p.name}</span>`;
        s.addEventListener('mouseenter', () => s.style.setProperty('--hue', nextHue()));
        s.addEventListener('click', () => onLateral(p.id));
        stackEl.appendChild(s);
      });
  }

  return { buildStack, el: stackEl };
}
