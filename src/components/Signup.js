/**
 * Email signup — presentation + interaction only.
 * Does not touch world state or routing.
 */
import { RM } from '../state/worldState.js';
import { subscribeEmail } from '../services/newsletter.js';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function bindSignupForm(form) {
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  const input = form.querySelector('input[type="email"]');
  const status = form.querySelector('.signup-status');
  const btn = form.querySelector('button[type="submit"]');
  if (!input || !status || !btn) return;

  const setState = (state, message = '') => {
    form.dataset.state = state;
    input.setAttribute('aria-invalid', state === 'invalid' ? 'true' : 'false');
    if (message) {
      status.hidden = false;
      status.textContent = message;
    } else {
      status.hidden = true;
      status.textContent = '';
    }
    btn.disabled = state === 'submitting';
  };

  input.addEventListener('focus', () => {
    const s = form.dataset.state;
    if (s === 'idle' || s === 'focus') setState('focus');
  });
  input.addEventListener('blur', () => {
    if (form.dataset.state === 'focus') setState('idle');
  });
  input.addEventListener('input', () => {
    if (form.dataset.state === 'invalid' || form.dataset.state === 'error') setState('focus');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const email = input.value.trim();
    if (!isValidEmail(email)) {
      setState('invalid', 'Enter a valid email address.');
      input.focus();
      return;
    }
    setState('submitting', RM ? 'Sending…' : 'Sending…');
    try {
      const result = await subscribeEmail(email);
      if (result.ok) {
        setState('success', result.message || "You're in.");
        input.value = '';
        return;
      }
      setState('error', result.message || 'Something went wrong. Try again.');
    } catch (err) {
      console.warn('[tcc] signup', err);
      setState('error', 'Something went wrong. Try again.');
    }
  });

  setState('idle');
}

export function bindAllSignups(root = document) {
  root.querySelectorAll('form[data-signup]').forEach(bindSignupForm);
}

/** Markup shared by Collection / Project / Info. */
export function signupMarkup(id) {
  return `<form class="signup" data-signup novalidate>
  <div class="signup-row">
    <label class="sr-only" for="${id}">Email address</label>
    <input id="${id}" type="email" name="email" autocomplete="email" required placeholder="Email address" spellcheck="false">
    <button type="submit">Join</button>
  </div>
  <p class="signup-status" role="status" aria-live="polite" hidden></p>
</form>`;
}
