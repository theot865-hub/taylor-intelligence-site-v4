(() => {
  // No query/hash is used as proof of a lead or booking. Keep arbitrary private
  // details out of the consent-based PageView URL. This runs before tracking.js.
  try {
    const clean = new URL(window.location.href);
    if (clean.search || clean.hash) {
      clean.search = '';
      clean.hash = '';
      window.history.replaceState(window.history.state, '', clean.href);
    }
  } catch {
    document.documentElement.dataset.privateURLCleanup = 'failed';
  }

  // A public page visit or client flag does not prove an appointment. The
  // HttpOnly receipt is sent by the browser, never read from JavaScript/URLs.
  const boot = () => {
    const card = document.querySelector('#thank-you-card');
    const heading = document.querySelector('#thanks-title');
    const intro = document.querySelector('#thanks-intro');
    const note = document.querySelector('#thanks-note');
    const calendar = document.querySelector('#choose-call');
    const status = document.querySelector('#booking-confirmation-status');
    const refresh = document.querySelector('#refresh-confirmation');
    const legacy = document.querySelector('#check-legacy-booking');
    const calendarPanel = document.querySelector('#calendar-booking');
    const calendarFrame = document.querySelector('#calendar-frame');
    if (!card || !heading || !intro || !note || !calendar || !status || !refresh
        || !calendarPanel || !calendarFrame) return;

    const pollInterval = 20000;
    const budget = 15 * 60 * 1000;
    const maxReads = 45;
    let reads = 0;
    let started = 0;
    let timer;
    let controller;
    let active = false;
    let checking = false;
    let lastState = 'unknown';
    let terminal = false;
    let cooldownUntil = 0;
    let cooldownTimer;
    let legacyMode = false;
    const calendarURL = 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C';
    const embedURL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C?gv=true';
    const genericIntro = 'If you’ve chosen a time, your booking confirmation has the call details. Otherwise, choose a time below.';
    const genericNote = 'Already booked? There’s no need to book again. Check your confirmation email for the time and joining link.';

    const say = message => { status.textContent = message; status.hidden = !message; };
    const hideCalendar = () => {
      calendarPanel.hidden = true;
      if (calendarFrame.getAttribute('src')) calendarFrame.removeAttribute('src');
    };
    const generic = () => {
      heading.textContent = 'Thanks for your interest';
      intro.textContent = genericIntro;
      note.textContent = genericNote;
      calendar.hidden = false;
      calendar.href = '/ai-intensive/book/';
      calendar.textContent = 'Book a free call';
      calendar.removeAttribute('target');
      calendar.removeAttribute('rel');
      hideCalendar();
    };
    const normalize = data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      if (data.leadSaved === false && data.bookingStatus === 'unknown' && data.eventId === undefined) {
        return { leadSaved: false, bookingStatus: 'unknown' };
      }
      if (data.leadSaved !== true) return null;
      if (data.bookingStatus === 'pending' && data.eventId === undefined) return { leadSaved: true, bookingStatus: 'pending' };
      if (['confirmed', 'cancelled'].includes(data.bookingStatus) && typeof data.eventId === 'string' && /^ti-schedule-[a-f0-9]{64}$/.test(data.eventId)) {
        return { leadSaved: true, bookingStatus: data.bookingStatus, eventId: data.eventId };
      }
      return null;
    };
    const finish = () => {
      active = false;
      clearTimeout(timer);
      timer = undefined;
    };
    const pause = () => {
      finish();
      refresh.hidden = false;
      refresh.disabled = Date.now() < cooldownUntil;
      say(lastState === 'pending'
        ? 'Google’s confirmation can take a few minutes to reach this page. If you’ve booked, check your confirmation email or choose “I’ve booked—check confirmation”.'
        : 'We couldn’t check your Google Calendar confirmation just now. Check your confirmation email, or refresh to try again.');
    };
    const again = () => {
      if (!active) return;
      const remaining = budget - (Date.now() - started);
      if (reads >= maxReads || remaining <= 0) { pause(); return; }
      timer = setTimeout(() => { timer = undefined; void check(); }, Math.min(pollInterval, remaining));
    };
    const apply = record => {
      lastState = record.bookingStatus;
      terminal = record.bookingStatus !== 'pending';
      // Nonconfirmed states also clear any pending Schedule in the shared
      // tracker; that method emits only for a valid confirmed receipt.
      try { window.TIAds?.confirmedSchedule(record); } catch { /* Measurement cannot affect booking. */ }
      if (record.bookingStatus === 'confirmed') {
        finish();
        heading.textContent = 'Thanks—your call is booked';
        intro.textContent = 'Your Google Calendar confirmation email has the time and joining link. We’re looking forward to speaking with you.';
        note.textContent = 'Need to change your booking? Use the link in your Google Calendar confirmation email.';
        calendar.hidden = true;
        hideCalendar();
        refresh.hidden = true;
        say('Your booking has been confirmed by Google Calendar.');
        // Pass only the whitelisted, server-verified receipt. Meta permissions,
        // SDK readiness and durable deduplication belong to the shared tracker.
      } else if (record.bookingStatus === 'cancelled') {
        finish();
        heading.textContent = 'Your call was cancelled';
        intro.textContent = 'Your Google Calendar appointment was cancelled. You can choose a new time below.';
        note.textContent = 'Your previous confirmation email has the details of that appointment.';
        calendar.hidden = false;
        calendar.href = '/ai-intensive/book/';
        calendar.textContent = 'Book a new call';
        calendar.removeAttribute('target');
        calendar.removeAttribute('rel');
        hideCalendar();
        refresh.hidden = true;
        say('You can book a new call using the calendar link.');
      } else if (record.bookingStatus === 'unknown') {
        finish();
        generic();
        refresh.hidden = true;
        say('');
      } else {
        heading.textContent = 'Choose a time for your call';
        intro.textContent = 'Your details are saved. Pick a 15-minute time below. Use the same email address you entered on the previous page. Google will email your confirmation; it can take a few minutes for that confirmation to reach this page.';
        note.textContent = 'After booking, choose “I’ve booked—check confirmation”. Your Google Calendar appointment is still valid while this page waits for the confirmation.';
        calendar.hidden = false;
        calendar.href = calendarURL;
        calendar.textContent = 'Open the calendar in a new tab';
        calendar.setAttribute('target', '_blank');
        calendar.setAttribute('rel', 'noopener noreferrer');
        calendarPanel.hidden = false;
        if (calendarFrame.getAttribute('src') !== embedURL) calendarFrame.setAttribute('src', embedURL);
        refresh.hidden = false;
        refresh.disabled = false;
        say('Checking for Google Calendar’s confirmation. You can choose your time below.');
        again();
      }
    };
    const check = async () => {
      if (!active || checking) return;
      if (Date.now() < cooldownUntil) { pause(); return; }
      if (reads >= maxReads || Date.now() - started >= budget) { pause(); return; }
      checking = true;
      reads++;
      controller = new window.AbortController();
      card.setAttribute('aria-busy', 'true');
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await window.fetch('/api/ai-intensive/booking-status', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
          headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (response.status === 429) {
          const raw = response.headers?.get('Retry-After') ?? '60';
          const seconds = /^\d{1,5}$/.test(raw) && Number(raw) > 0 ? Number(raw) : 60;
          cooldownUntil = Date.now() + seconds * 1000;
          finish();
          refresh.hidden = false;
          refresh.disabled = true;
          say('Please wait before checking again. Google’s confirmation may still be on its way; your appointment is unaffected.');
          clearTimeout(cooldownTimer);
          cooldownTimer = setTimeout(() => { cooldownTimer = undefined; refresh.disabled = false; }, seconds * 1000);
          return;
        }
        const record = response.ok ? normalize(await response.json()) : null;
        if (!active) return;
        if (!record) throw new Error('Unconfirmed booking status');
        apply(record);
      } catch {
        if (active) {
          say('We couldn’t check your confirmation just now. We’ll try again automatically. Your calendar booking is unaffected.');
          again();
        }
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        checking = false;
        if (!refresh.hidden) refresh.disabled = Date.now() < cooldownUntil;
        card.removeAttribute('aria-busy');
      }
    };
    const start = () => {
      if (!legacyMode || checking || active) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() < cooldownUntil) return;
      reads = 0;
      started = Date.now();
      active = true;
      lastState = 'unknown';
      terminal = false;
      refresh.hidden = true;
      refresh.disabled = true;
      say('Checking your Google Calendar confirmation…');
      void check();
    };
    refresh.addEventListener('click', () => {
      if (checking || Date.now() < cooldownUntil) return;
      finish();
      start();
    });
    legacy?.addEventListener('click', () => {
      if (terminal) return;
      legacyMode = true;
      legacy.hidden = true;
      start();
    });
    const resume = () => {
      if (!terminal && !active && !checking && document.visibilityState !== 'hidden' && Date.now() >= cooldownUntil) start();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { finish(); controller?.abort(); }
      else resume();
    });
    window.addEventListener('pagehide', () => { finish(); clearTimeout(cooldownTimer); controller?.abort(); });
    window.addEventListener('pageshow', event => { if (event.persisted) resume(); });
    // A Calendly widget completion belongs to this tab only. This is browser
    // evidence; the separate legacy Google path remains server-verified.
    let observed;
    try { observed = window.TICalendlySession?.read(); } catch { /* Optional storage. */ }
    if (observed) {
      terminal = true;
      if (legacy) legacy.hidden = true;
      finish();
      heading.textContent = 'Thanks—your call is booked';
      intro.textContent = 'Your Calendly confirmation email has the time and joining link. We’re looking forward to speaking with you.';
      note.textContent = 'Need to change your booking? Use the link in your Calendly confirmation email.';
      calendar.hidden = true;
      hideCalendar();
      refresh.hidden = true;
      say('Your booking was completed in Calendly.');
      try { window.TIAds?.observedCalendlySchedule(observed); } catch { /* Measurement cannot affect booking. */ }
      return;
    }
    // Default visits do not consult an old Google cookie or invite duplicate
    // booking. Legacy verification starts only from the explicitly labelled action.
    generic();
    if (typeof window.fetch !== 'function' || typeof window.AbortController !== 'function') {
      if (legacy) legacy.hidden = true;
    }
  };
  // Deferred tracking.js defines TIAds before DOMContentLoaded. Confirmation
  // works even when Meta is declined, blocked or unavailable.
  if (document.readyState === 'complete') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
