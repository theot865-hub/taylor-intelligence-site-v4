(() => {
  const form = document.querySelector('#company-checkout');
  if (!form) return;
  const input = form.elements.extraEmployees;
  const attempt = form.elements.checkoutAttempt;
  const total = document.querySelector('#order-total');
  const status = document.querySelector('#checkout-status');
  const submit = form.querySelector('[type="submit"]');
  const steppers = [...form.querySelectorAll('[data-seat-step]')];
  const format = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
  const params = new URLSearchParams(location.search);
  let ready = false;
  let busy = params.get('checkout') === 'success';
  let paid = false;
  let selection = 0;

  const say = message => {
    status.textContent = message;
    status.hidden = !message;
  };
  const newAttempt = () => { attempt.value = crypto.randomUUID(); };
  const update = (value, renew = true) => {
    const next = Number.isFinite(Number(value)) ? Math.max(0, Math.min(99, Math.trunc(Number(value)))) : 0;
    if (renew && next !== selection) newAttempt();
    selection = next;
    input.value = String(next);
    total.value = `$${format.format(2000 + next * 100)}`;
    for (const button of steppers) button.disabled = busy || paid || (Number(button.dataset.seatStep) < 0 ? next === 0 : next === 99);
    input.disabled = busy || paid;
    submit.disabled = busy || paid || !ready;
  };
  newAttempt();
  update(params.get('employees') || 0);
  steppers.forEach(button => button.addEventListener('click', () => update(selection + Number(button.dataset.seatStep))));
  input.addEventListener('input', () => update(input.value));
  input.addEventListener('change', () => update(input.value));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || busy || paid) return;
    busy = true;
    update(selection, false);
    say('Opening secure checkout…');
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraEmployees: selection, checkoutAttempt: attempt.value })
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error('Checkout unavailable');
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout destination');
      location.assign(destination.href);
    } catch {
      busy = false;
      update(selection, false);
      say('We couldn’t open checkout. Please try again. You haven’t been charged by this page.');
    }
  });

  const initialize = async () => {
    try {
      const response = await fetch('/api/checkout/status', { cache: 'no-store' });
      const result = await response.json();
      ready = response.ok && result.ready === true;
    } catch { ready = false; }
    update(selection, false);
    if (!ready) say('Booking is temporarily unavailable. Please try again shortly.');
    else if (params.get('checkout') === 'cancelled') say('Checkout was cancelled. Adjust your seats and try again when you’re ready.');
    if (params.get('checkout') !== 'success') return;
    const session = params.get('session_id');
    if (!session || !/^cs_[A-Za-z0-9_]+$/.test(session)) {
      say('We couldn’t confirm this booking. Check your Stripe receipt or contact theo@taylorintelligence.ai.');
      return;
    }
    say('Checking your booking…');
    try {
      const response = await fetch(`/api/checkout/confirmation?session_id=${encodeURIComponent(session)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error('Confirmation unavailable');
      if (result.paymentStatus === 'paid' && result.status === 'complete') {
        paid = true;
        update(result.extraEmployees, false);
        submit.textContent = 'Company seat booked';
        say('You’re booked. Check your Stripe receipt; we’ll email you with the group call details.');
      } else {
        say('Your payment is still processing. Please wait for confirmation from Stripe before trying again.');
        busy = true;
        update(selection, false);
      }
    } catch {
      say('We couldn’t confirm your payment yet. Check your Stripe receipt or contact theo@taylorintelligence.ai before trying again.');
      busy = true;
      update(selection, false);
    }
  };
  window.addEventListener('pageshow', event => {
    if (!event.persisted || params.get('checkout') === 'success') return;
    busy = false;
    ready = false;
    update(selection, false);
    say('');
    initialize();
  });
  initialize();
})();
