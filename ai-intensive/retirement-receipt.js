(() => {
  const status = document.querySelector('#payment-confirmation');
  if (!status) return;
  const url = new URL(window.location.href);
  const session = url.searchParams.get('session_id');
  if (!session) return;
  // Historical return links can still be used after retirement. Never turn a
  // query-string claim into a payment receipt or create a replacement checkout.
  try { window.history.replaceState(window.history.state, '', url.origin + url.pathname); }
  catch { /* No third-party scripts are loaded on these return pages. */ }
  if (!/^cs_(?:live|test)_[A-Za-z0-9]{12,200}$/.test(session)) return;
  status.hidden = false;
  status.textContent = 'Checking your previous payment…';
  fetch(`/api/checkout/confirmation?session_id=${encodeURIComponent(session)}`, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const result = await response.json();
      status.textContent = result.paymentStatus === 'paid' && result.status === 'complete'
        ? 'Your previous payment is confirmed. The programme has ended; please contact Theo about your booking.'
        : 'This payment is not confirmed as complete. Please contact Theo if you need help with a previous booking.';
    })
    .catch(() => { status.textContent = 'We could not check this payment. Please contact Theo with your Stripe confirmation.'; });
})();
