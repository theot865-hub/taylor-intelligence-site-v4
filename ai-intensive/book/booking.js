(() => {
  const widget = document.querySelector('#calendly-widget');
  const status = document.querySelector('#call-status');
  const fallback = document.querySelector('#calendar-fallback');
  const destination = '/ai-intensive/thank-you/';
  if (!widget || !status || !fallback) return;
  const say = text => { status.textContent = text; status.hidden = false; };
  let eventURL;
  try {
    const url = new URL(window.TICalendlyConfig?.eventUrl);
    if (url.origin !== 'https://calendly.com' || url.username || url.password
        || url.search || url.hash
        || !/^\/[a-z0-9][a-z0-9_-]{0,99}\/[a-z0-9][a-z0-9_-]{0,99}\/?$/i.test(url.pathname)) throw new Error('Unconfigured');
    eventURL = url.href;
  } catch {
    say('Please email Theo to arrange your free 15-minute call.');
    return;
  }
  fallback.href = eventURL;
  fallback.hidden = false;
  // Do not let a previous booking masquerade as this one if hashing/storage
  // fails later. If a readable old marker cannot be cleared, use the ordinary
  // provider fallback rather than claiming completion on our thank-you page.
  if (window.TICalendlySession?.clear() === false) {
    say('Please open Calendly below to choose your time, or email Theo.');
    return;
  }
  if (typeof window.addEventListener !== 'function') return;
  let completed = false;
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const eventPattern = new RegExp('^https://api\\.calendly\\.com/scheduled_events/(' + uuid + ')$', 'i');
  const inviteePattern = new RegExp('^https://api\\.calendly\\.com/scheduled_events/(' + uuid + ')/invitees/(' + uuid + ')$', 'i');
  // Register before initializing the official JS widget. A plain iframe is not
  // Calendly's supported parent-window completion integration.
  window.addEventListener('message', async event => {
    let eventURI, inviteeURI;
    try {
      const iframe = widget.querySelector('iframe');
      if (completed || event.origin !== 'https://calendly.com' || !iframe?.contentWindow
          || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object'
          || Array.isArray(event.data) || event.data.event !== 'calendly.event_scheduled') return;
      const payload = event.data.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      eventURI = payload.event?.uri;
      inviteeURI = payload.invitee?.uri;
      if (typeof eventURI !== 'string' || typeof inviteeURI !== 'string'
          || eventURI.length > 200 || inviteeURI.length > 250) return;
      const scheduled = eventURI.match(eventPattern);
      const invitee = inviteeURI.match(inviteePattern);
      if (!scheduled || !invitee || scheduled[1].toLowerCase() !== invitee[1].toLowerCase()) return;
    } catch { return; }
    completed = true;
    say('Your call is booked. Opening your confirmation…');
    try {
      const identity = 'calendly:v1:' + eventURI.toLowerCase() + ':' + inviteeURI.toLowerCase();
      const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const id = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      window.TICalendlySession?.save('ti-schedule-' + id);
    } catch { /* Scheduling succeeds even when optional measurement cannot persist. */ }
    window.location.assign(destination);
  });
  let initialized = false;
  const init = () => {
    if (initialized) return;
    if (typeof window.Calendly?.initInlineWidget !== 'function') {
      say('The calendar couldn’t load. Open Calendly below, or email Theo.');
      return;
    }
    try {
      widget.hidden = false;
      window.Calendly.initInlineWidget({ url: eventURL, parentElement: widget });
      initialized = true;
      say('Choose your time and enter your details once in Calendly.');
    } catch {
      widget.hidden = true;
      say('The calendar couldn’t load. Open Calendly below, or email Theo.');
    }
  };
  if (typeof window.Calendly?.initInlineWidget === 'function') init();
  else {
    say('Loading the calendar…');
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    script.onload = init;
    script.onerror = () => say('The calendar couldn’t load. Open Calendly below, or email Theo.');
    document.head.appendChild(script);
  }
})();
