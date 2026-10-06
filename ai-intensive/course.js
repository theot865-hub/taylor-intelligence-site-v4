(function () {
  'use strict';
  var form = document.getElementById('course-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');
  var originalButton = button.innerHTML;

  // Only capture campaign fields on this page. These are sent with an enquiry;
  // no advertising pixel, cookies, or third-party script is loaded.
  var params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(function (name) {
    var value = params.get(name);
    if (!value) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value.slice(0, 500);
    form.appendChild(input);
  });
  var page = document.createElement('input');
  page.type = 'hidden';
  page.name = 'page_path';
  page.value = window.location.pathname;
  form.appendChild(page);

  function announce(message, state) {
    status.hidden = false;
    status.dataset.state = state;
    status.textContent = message;
    status.focus();
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    if (form.elements.botcheck.checked) return;
    button.disabled = true;
    button.textContent = 'Sending your enquiry…';
    status.hidden = true;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 15000);

    try {
      var response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: controller.signal
      });
      var result = await response.json();
      if (!response.ok || result.success !== true) {
        announce('Your enquiry wasn’t accepted. Please try again, or email theo@taylorintelligence.ai. Your details are still in the form.', 'error');
        return;
      }
      form.reset();
      announce('Thanks — your enquiry was accepted. We’ll reply by email with the course details and next steps. Your seat is not booked yet.', 'success');
      // A local event hook for future approved analytics. Fires only after the
      // provider acknowledges success; it is not a Meta conversion integration.
      window.dispatchEvent(new CustomEvent('ai_course_enquiry_accepted', { detail: { course: 'ai-intensive-2026-10-23' } }));
    } catch (error) {
      announce('We couldn’t confirm whether your enquiry was received. Your details are still in the form. Please email theo@taylorintelligence.ai before trying again.', 'error');
    } finally {
      window.clearTimeout(timeout);
      button.disabled = false;
      button.innerHTML = originalButton;
    }
  });
}());
