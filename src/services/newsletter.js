/**
 * Newsletter provider boundary — no service configured yet.
 * Replace `subscribeEmail` when Mailchimp / Klaviyo / Campaign Monitor / etc is wired.
 * UI must not fake success until a real provider returns ok.
 */
export async function subscribeEmail(email) {
  const normalised = String(email || '').trim().toLowerCase();
  if (!normalised) {
    return { ok: false, code: 'invalid', message: 'Enter an email address.' };
  }
  // Provider integration point — intentionally unimplemented.
  return {
    ok: false,
    code: 'not_configured',
    message: 'Signup isn’t connected yet.',
    email: normalised,
  };
}
