(() => {
  const KEY = 'ti-calendly-completion-v1';
  const TTL_MS = 15 * 60 * 1000;
  // A short-lived browser observation, not a server-attested receipt.
  // Never retain Calendly URIs, contact details, answers or raw event payloads.
  const normalize = record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || Object.keys(record).sort().join(',') !== 'completedAt,eventId,source,version'
        || record.version !== 1 || record.source !== 'calendly-embed'
        || !/^ti-schedule-[a-f0-9]{64}$/.test(record.eventId ?? '')
        || !Number.isSafeInteger(record.completedAt)) return null;
    const age = Date.now() - record.completedAt;
    if (age < 0 || age >= TTL_MS) return null;
    return { version: 1, source: 'calendly-embed', eventId: record.eventId, completedAt: record.completedAt };
  };
  const read = () => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (!raw || raw.length > 512) return null;
      return normalize(JSON.parse(raw));
    } catch { return null; }
  };
  const save = eventId => {
    try {
      const record = normalize({ version: 1, source: 'calendly-embed', eventId, completedAt: Date.now() });
      if (!record) return null;
      const raw = JSON.stringify(record);
      window.sessionStorage.setItem(KEY, raw);
      return window.sessionStorage.getItem(KEY) === raw ? read() : null;
    } catch { return null; }
  };
  const clear = () => {
    try { window.sessionStorage.removeItem(KEY); } catch { /* Storage may be blocked. */ }
    return read() === null;
  };
  window.TICalendlySession = Object.freeze({ KEY, TTL_MS, normalize, read, save, clear });
})();
