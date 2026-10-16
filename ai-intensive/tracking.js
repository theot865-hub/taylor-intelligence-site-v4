(() => {
  if (window.TIAds) return;
  const PIXEL = '1281844947404157';
  const CONSENT_KEY = 'ti-ad-consent-v1';
  const PURCHASES_KEY = 'ti-meta-purchases-v1';
  const SCHEDULES_KEY = 'ti-meta-schedules-v1';
  const CONSENT_AGE = 180 * 24 * 60 * 60 * 1000;
  const production = location.protocol === 'https:' && ['taylorintelligence.ai', 'www.taylorintelligence.ai'].includes(location.hostname);
  const privacySignal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  let consent = 'unknown';
  let initialized = false;
  let sdkReady = false;
  let pageSending = false;
  let pageViewed = false;
  let pendingPurchase;
  let pendingSchedule;
  const sentSchedules = new Set();
  const claimingSchedules = new Set();
  const sentPurchases = new Set();
  const claimingPurchases = new Set();
  const sentCheckouts = new Set();
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } };
  const validCount = n => Number.isInteger(n) && n >= 0 && n <= 99;
  // The return token is removed by checkout.js before DOMContentLoaded. Refuse
  // third-party tracking if cleanup failed or an incoming referrer exposes one.
  function safeURL(value) {
    // Check each layer, including encoded parameter names and tokens. An
    // undecodable or more deeply encoded URL cannot be safely sent to Meta.
    for (let depth = 0; depth <= 3; depth++) {
      if (/(?:session_id|cs_live_|cs_test_)/i.test(value)) return false;
      if (!value.includes('%')) return true;
      if (depth === 3) return false;
      try { value = decodeURIComponent(value); } catch { return false; }
    }
    return false;
  }
  const safeLocation = () => safeURL(location.href) && safeURL(document.referrer);
  const safeThankYou = () => document.body?.dataset?.tiAdsPage !== 'thank-you'
    || (document.documentElement?.dataset?.privateURLCleanup !== 'failed'
      && !location.search && !location.hash);
  const permitted = () => production && consent === 'granted' && !privacySignal() && safeLocation() && safeThankYou();
  const order = (extras, companyPrice = 1200) => ({
    content_name: 'AI Intensive — Company Seat', content_type: 'product',
    content_ids: extras ? ['ti-company-intensive', 'ti-employee-observer'] : ['ti-company-intensive'],
    contents: [{ id: 'ti-company-intensive', quantity: 1, item_price: companyPrice },
      ...(extras ? [{ id: 'ti-employee-observer', quantity: extras, item_price: 100 }] : [])],
    num_items: 1 + extras, value: companyPrice + 100 * extras, currency: 'CAD'
  });

  function pixel() {
    if (!permitted()) return false;
    if (!initialized) {
      // Official asynchronous Pixel bootstrap. No noscript beacon: opting out
      // must also prevent tracking without JavaScript. No advanced matching.
      if (!window.fbq) {
        const fbq = window.fbq = function () {
          fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
        };
        window._fbq = window._fbq || fbq;
        fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      }
      // The bootstrap queue contains configuration only. Manual events and
      // consent grant must wait until the SDK loads and consent is rechecked.
      window.fbq('consent', 'revoke');
      window.fbq('set', 'autoConfig', false, PIXEL);
      window.fbq('init', PIXEL);
      initialized = true;
      sdkReady = typeof window.fbq.callMethod === 'function';
      if (sdkReady) {
        window.fbq('consent', 'grant');
      } else {
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        script.onload = () => {
          sdkReady = typeof window.fbq.callMethod === 'function';
          if (!sdkReady) return;
          try {
            window.fbq('consent', permitted() ? 'grant' : 'revoke');
            if (permitted()) page();
          } catch { /* Tracking cannot affect booking. */ }
        };
        script.onerror = () => { sdkReady = false; };
        document.head.appendChild(script);
      }
    }
    return sdkReady && typeof window.fbq.callMethod === 'function' && permitted();
  }
  function track(name, data, id) {
    try {
      if (!pixel()) return false;
      window.fbq('trackSingle', PIXEL, name, data, ...(id ? [{ eventID: id }] : []));
      return true;
    } catch { return false; } // Ad blockers and analytics errors cannot stop booking.
  }
  function purchaseClaims() {
    try {
      const raw = localStorage.getItem(PURCHASES_KEY);
      if (raw === null) return [];
      if (raw.length > 10000) return null;
      const value = JSON.parse(raw);
      return Array.isArray(value) && value.length <= 100
        && value.every(id => /^ti-purchase-[a-f0-9]{64}$/.test(id)) ? value : null;
    } catch { return null; }
  }
  function saveClaims(value) {
    try {
      const raw = JSON.stringify(value);
      localStorage.setItem(PURCHASES_KEY, raw);
      return localStorage.getItem(PURCHASES_KEY) === raw;
    } catch { return false; }
  }
  async function purchase() {
    const result = pendingPurchase;
    if (!result || !permitted()) return;
    const id = result.purchaseEventId;
    if (sentPurchases.has(id) || claimingPurchases.has(id)) return;
    try {
      if (!pixel() || typeof navigator.locks?.request !== 'function') return;
      claimingPurchases.add(id);
      // Fail closed without cross-tab locking or durable storage. Never wait
      // for this best-effort conversion in the booking flow.
      await navigator.locks.request('ti-meta-purchase', { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock || !permitted() || !sdkReady || typeof window.fbq.callMethod !== 'function') return;
        const saved = purchaseClaims();
        if (!saved || saved.includes(id) || sentPurchases.has(id)) return;
        if (!saveClaims([...saved, id].slice(-100))) return;
        // Historical paid sessions retain their server-verified purchase value.
        const companyPrice = (result.amountTotal - result.extraEmployees * 10000) / 100;
        if (track('Purchase', order(result.extraEmployees, companyPrice), id)) {
          sentPurchases.add(id);
        } else {
          // A failed synchronous dispatch has not submitted the event. Remove
          // only our own claim while the same exclusive lock remains held.
          const latest = purchaseClaims();
          if (latest) saveClaims(latest.filter(value => value !== id));
        }
      });
    } catch { /* Storage, locks and SDK failures cannot affect booking. */ }
    finally { claimingPurchases.delete(id); }
  }
  // Private Google receipts and browser-observed Calendly completions use distinct inputs.
  // Consent, durable claims and a cross-tab lock are required before dispatch.
  const freshSchedule = result => {
    if (result?.source !== 'calendly-embed') return true;
    try { return !!window.TICalendlySession?.normalize(result); } catch { return false; }
  };
  async function schedule() {
    const result = pendingSchedule;
    if (!result || !freshSchedule(result) || !permitted()) return;
    const id = result.eventId;
    if (sentSchedules.has(id) || claimingSchedules.has(id)) return;
    try {
      if (!pixel() || typeof navigator.locks?.request !== 'function') return;
      claimingSchedules.add(id);
      await navigator.locks.request('ti-meta-schedule', { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock || pendingSchedule?.eventId !== id || !freshSchedule(result) || !permitted()
            || !sdkReady || typeof window.fbq.callMethod !== 'function') return;
        const raw = localStorage.getItem(SCHEDULES_KEY);
        if (raw !== null && raw.length > 10000) return;
        const saved = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(saved) || saved.length > 100
            || !saved.every(value => /^ti-schedule-[a-f0-9]{64}$/.test(value))
            || saved.includes(id) || sentSchedules.has(id)) return;
        const claim = JSON.stringify([...saved, id].slice(-100));
        localStorage.setItem(SCHEDULES_KEY, claim);
        if (localStorage.getItem(SCHEDULES_KEY) !== claim) return;
        if (track('Schedule', { content_name: 'AI Intensive — free call' }, id)) {
          sentSchedules.add(id);
        } else {
          // Synchronous SDK failure: release only our own claim under the lock.
          localStorage.setItem(SCHEDULES_KEY, JSON.stringify(saved));
        }
      });
    } catch { /* Analytics cannot affect a confirmed booking. */ }
    finally { claimingSchedules.delete(id); }
  }
  function page() {
    if (pageSending) return;
    pageSending = true;
    try {
      if (!pageViewed && permitted()) {
        if (track('PageView', {})) {
          pageViewed = true;
          if (document.body?.dataset?.tiAdsPage !== 'thank-you') {
          track('ViewContent', { content_name: 'AI Intensive for Business Owners', content_type: 'product', content_ids: ['ti-company-intensive'], value: 1200, currency: 'CAD' });
          }
        }
      }
    } finally { pageSending = false; }
    void purchase();
    void schedule();
  }
  function removePixelCookies() {
    for (const name of ['_fbp', '_fbc']) {
      for (const domain of ['', `; domain=${location.hostname}`, '; domain=.taylorintelligence.ai']) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
      }
    }
  }
  function apply(value) {
    consent = privacySignal() ? 'denied' : value;
    if (consent !== 'granted') {
      try { if (initialized) window.fbq('consent', 'revoke'); } catch { /* Nonessential. */ }
      removePixelCookies();
    } else {
      try { if (initialized && sdkReady && permitted()) window.fbq('consent', 'grant'); } catch { /* Nonessential. */ }
      page();
    }
    const label = document.querySelector('#ad-choice');
    if (label) label.textContent = `Ad choices: ${consent === 'granted' ? 'on' : 'off'}`;
  }

  // Called only through distinct server-receipt or browser-observation methods.
  window.TIAds = {
    observedCalendlySchedule(record) {
      if (document.body?.dataset?.tiAdsPage !== 'thank-you') return;
      try {
        const observed = window.TICalendlySession?.normalize(record);
        const saved = window.TICalendlySession?.read();
        if (!observed || !saved || saved.eventId !== observed.eventId
            || saved.completedAt !== observed.completedAt) return;
        pendingSchedule = observed;
        void schedule();
      } catch { /* Browser measurement is optional. */ }
    },
    confirmedSchedule(result) {
      if (document.body?.dataset?.tiAdsPage !== 'thank-you') return;
      if (result?.leadSaved !== true || result.bookingStatus !== 'confirmed'
          || !/^ti-schedule-[a-f0-9]{64}$/.test(result.eventId ?? '')) {
        pendingSchedule = undefined;
        return;
      }
      pendingSchedule = { eventId: result.eventId };
      void schedule();
    },
    async checkoutStarted(extras, attempt) {
      if (!validCount(extras) || !/^[0-9a-f-]{36}$/i.test(attempt) || sentCheckouts.has(attempt)) return;
      if (track('InitiateCheckout', order(extras), `ti-checkout-${attempt}`)) {
        sentCheckouts.add(attempt);
        // Give the asynchronous Pixel a short head start before leaving for
        // Stripe. Always bounded, including blocked/slow Meta requests.
        await new Promise(resolve => setTimeout(resolve, 180));
      }
    },
    confirmedPurchase(result) {
      if (result?.paymentStatus !== 'paid' || result.status !== 'complete'
          || !validCount(result.extraEmployees) || result.currency !== 'cad'
          || !Number.isInteger(result.amountTotal)
          || ![120000, 200000].includes(result.amountTotal - result.extraEmployees * 10000)
          || !/^ti-purchase-[a-f0-9]{64}$/.test(result.purchaseEventId ?? '')) return;
      pendingPurchase = result;
      void purchase();
    }
  };

  function boot() {
    const notice = document.querySelector('#ad-notice');
    const allow = document.querySelector('#ad-allow');
    const decline = document.querySelector('#ad-decline');
    const settings = document.querySelector('#ad-choice');
    const saved = read(CONSENT_KEY);
    const current = saved && ['granted', 'denied'].includes(saved.value)
      && Number.isFinite(saved.at) && Date.now() - saved.at >= 0 && Date.now() - saved.at < CONSENT_AGE;
    apply(current ? saved.value : 'unknown');
    if (notice) notice.hidden = current || privacySignal();
    const choose = value => {
      write(CONSENT_KEY, { value, at: Date.now() });
      apply(value);
      notice.hidden = true;
      settings.focus({ preventScroll: true });
    };
    allow?.addEventListener('click', () => choose('granted'));
    decline?.addEventListener('click', () => choose('denied'));
    settings?.addEventListener('click', () => {
      notice.hidden = false;
      allow.disabled = privacySignal();
      document.querySelector('#ad-notice-text').textContent = privacySignal()
        ? 'Your browser’s privacy preference keeps Meta ad measurement off. Booking works normally.'
        : document.body?.dataset?.tiAdsPage === 'thank-you'
          ? 'Allow Meta cookies to measure our ads using page visits and confirmed call bookings? You can book either way.'
        : document.querySelector('#company-checkout')
          ? 'Allow Meta cookies to measure our ads using page visits and booking events? You can book either way.'
          : 'Allow Meta cookies to measure our ads using page visits and offer views? You can book either way.';
      (privacySignal() ? decline : allow).focus();
    });
    document.querySelector('#ad-privacy-link')?.addEventListener('click', () => {
      document.querySelector('#ad-privacy').open = true;
      notice.hidden = true;
    });
    window.addEventListener('storage', event => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      const latest = read(CONSENT_KEY);
      apply(latest?.value === 'granted' && Number.isFinite(latest.at)
        && Date.now() - latest.at >= 0 && Date.now() - latest.at < CONSENT_AGE ? 'granted' : 'denied');
    });
  }
  document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
