(() => {
  /* Populate the lead form's hidden tracking fields so UTM / source / page
     data rides along into the lead email. Submission itself is handled
     in-page by the data-ajax-form handler in index.html (in-page thanks,
     on-site error fallback — no redirect, no /thank-you/ page). */
  const params = new URLSearchParams(window.location.search);
  const fields = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid'
  ];
  /* Tracking params ride along into the lead email — cap length and charset */
  const clean = (v) => (v || '').replace(/[^\w .\/:=-]/g, '').slice(0, 150);

  document.querySelectorAll('form[data-lead-form]').forEach((form) => {
    /* set defaultValue as well — form.reset() restores defaults, and the
       detail quick-capture form resets on every open */
    const pagePath = form.querySelector('input[name="page_path"]');
    if (pagePath) pagePath.defaultValue = pagePath.value = window.location.pathname;

    fields.forEach((field) => {
      const input = form.querySelector(`input[name="${field}"]`);
      if (input) input.defaultValue = input.value = clean(params.get(field));
    });
  });
})();
