(() => {
  const form = document.querySelector('#free-call-form');
  const status = document.querySelector('#call-status');
  const button = document.querySelector('#call-submit');
  const submission = document.querySelector('#call-submission-id');
  const destination = '/ai-intensive/thank-you/';
  // The ordinary POST remains available when enhancement is unavailable.
  if (!form || !status || !button || !submission || !window.fetch
      || !window.FormData || !window.crypto?.randomUUID || !window.AbortController) return;
  let submitting = false;
  const setStatus = (text, state) => {
    status.textContent = text;
    status.dataset.state = state;
    status.hidden = false;
  };
  const unavailable = 'We couldn’t save your details right now. Please try again, or email theo@taylorintelligence.ai.';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    if (!submission.value) submission.value = window.crypto.randomUUID();
    const fields = new FormData(form);
    const payload = {
      name: String(fields.get('name') || '').trim(),
      email: String(fields.get('email') || '').trim(),
      marketingConsent: fields.get('marketingConsent') === 'true',
      submissionId: submission.value,
      website: String(fields.get('website') || '')
    };
    submitting = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('Saving your details…', 'pending');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/ai-intensive/leads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.saved !== true || result.redirect !== destination) {
        const correction = [400, 403, 409, 413, 415, 429].includes(response.status)
          && typeof result?.error === 'string' && result.error.length <= 300;
        setStatus(correction ? result.error : unavailable, 'error');
        return;
      }
      setStatus('Details saved. Opening the calendar to choose a time…', 'saved');
      // No name, email or consent is added to this fixed destination URL.
      window.location.assign(destination);
    } catch {
      setStatus(unavailable, 'error');
    } finally {
      clearTimeout(timer);
      // Retain the submission ID after uncertain responses so retrying cannot
      // create a second lead when the first save succeeded before disconnect.
      if (status.dataset.state !== 'saved') {
        submitting = false;
        button.disabled = false;
        form.removeAttribute('aria-busy');
      }
    }
  });
})();
