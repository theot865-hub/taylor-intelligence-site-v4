(() => {
  'use strict';
  const form = document.querySelector('[data-newsletter-form]');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.newsletter-status');
  const label = button.textContent;
  let pending = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    status.hidden = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Signup not accepted');
      form.reset();
      status.dataset.state = 'success';
      status.textContent = 'Thanks — we’ve received your newsletter signup.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'We couldn’t confirm your signup. Please try again, or email theo@taylorintelligence.ai.';
    } finally {
      clearTimeout(timeout);
      pending = false;
      button.disabled = false;
      button.textContent = label;
      form.removeAttribute('aria-busy');
      status.hidden = false;
    }
  });
})();
