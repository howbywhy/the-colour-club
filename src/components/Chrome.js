/**
 * Chrome — renders world state into collection/project chrome controls.
 * Not a second navigation state machine. Presentation adapts; state does not fork.
 */
import { world, RM, D, $ } from '../state/worldState.js';
import { TIMING } from '../motion/transitions.js';

export function createChrome({
  closeInfo,
  closeProject,
  setView,
  openInfo,
  setDepth,
  onToggleDbg,
}) {
  function bindChrome() {
    $('#brandBtn').addEventListener('click', () => {
      closeInfo(() => {
        if (world.selected) closeProject();
        setTimeout(() => {
          setView('field');
          scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
        }, D(TIMING.brandDelay));
      });
    });
    $('#viewBtn').addEventListener('click', () => {
      const act = () => {
        if (world.selected) {
          closeProject();
          setTimeout(() => setView(world.view === 'field' ? 'index' : 'field'), D(TIMING.viewAfterClose));
        } else setView(world.view === 'field' ? 'index' : 'field');
      };
      if (world.infoOpen) closeInfo(act);
      else act();
    });
    $('#insClose').addEventListener('click', () => closeProject());
    $('#mImages').addEventListener('click', () => setDepth('images'));
    $('#mIdea').addEventListener('click', () => setDepth('idea'));
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (world.infoOpen) closeInfo();
        else if (world.selected && world.depth === 'idea') setDepth('images');
        else if (world.selected) closeProject();
      }
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) onToggleDbg();
    });
    setInterval(() => {
      const n = new Date();
      $('#clock').textContent =
        n.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) + ' ' + n.toTimeString().slice(0, 8);
    }, 1000);
  }

  return { bindChrome };
}
