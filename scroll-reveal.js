/* Homepage motion: native scrolling, no scroll handler, content always visible by default. */
(() => {
  const panel = document.querySelector('main.panel#main-content');
  if (!panel?.querySelector(':scope > #websites .website-gallery') ||
      !('IntersectionObserver' in window) || !window.matchMedia) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) return;

  const desktop = window.matchMedia('(min-width: 1101px)');
  const motionToggle = document.querySelector('.terrain-toggle');
  const manuallyPaused = () => desktop.matches && motionToggle?.getAttribute('aria-pressed') === 'true';
  const items = new Set();
  const seen = new WeakSet();
  let observer;

  const mark = (selector, kind, delay = 0) => {
    panel.querySelectorAll(selector).forEach(element => {
      element.dataset.tiReveal = kind;
      element.style.setProperty('--ti-reveal-delay', `${delay}ms`);
      items.add(element);
    });
  };

  // Headings lead; small descriptions follow. Neither the hero nor client marks animate.
  mark('.green-heading > div, #studio > h2', 'heading');
  mark('.green-heading > p', 'copy', 70);
  mark('.website-gallery .work-card', 'card');
  mark('.marketing-grid > .service-card, .software-grid > .service-card', 'card');
  mark('.website-offer, .marketing-quote', 'quiet');
  mark('.education-image', 'media');
  mark('.education-copy', 'copy');
  mark('#studio > .team-intro', 'copy', 60);
  mark('.team-members > .team-member', 'quiet');

  const settle = element => {
    seen.add(element);
    element.classList.remove('ti-reveal-enter');
    observer?.unobserve(element);
  };

  const staggerRows = () => {
    panel.querySelectorAll('.work-grid, .marketing-grid, .software-grid, .team-members').forEach(grid => {
      let rowTop = -Infinity;
      let column = 0;
      [...grid.children].forEach(element => {
        if (!items.has(element)) return;
        const top = element.getBoundingClientRect().top;
        if (Math.abs(top - rowTop) > 8) {
          rowTop = top;
          column = 0;
        }
        element.style.setProperty('--ti-reveal-delay', `${Math.min(column++ * 55, 165)}ms`);
      });
    });
  };

  const connect = () => {
    observer?.disconnect();
    if (motion.matches) {
      items.forEach(settle);
      return;
    }
    if (manuallyPaused()) {
      // Cancel current motion without consuming reveals that have not been seen.
      items.forEach(element => element.classList.remove('ti-reveal-enter'));
      return;
    }
    staggerRows();
    const root = desktop.matches ? document.querySelector('.scroll-area') : null;
    const bounds = root?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
    observer = new IntersectionObserver(entries => {
      if (motion.matches || manuallyPaused()) return;
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        if (seen.has(target)) return;
        seen.add(target);
        // Focus and direct hash destinations are immediately readable.
        const destination = location.hash && document.getElementById(location.hash.slice(1));
        if (motion.matches || target.contains(document.activeElement) ||
            (destination && (destination === target || destination.contains(target)))) return;
        target.classList.add('ti-reveal-enter');
      });
    }, { root, rootMargin: '0px 0px -24px 0px', threshold: 0 });

    items.forEach(element => {
      if (seen.has(element)) return;
      const rect = element.getBoundingClientRect();
      // Everything already on screen (including a restored scroll position) stays still.
      if (rect.height && rect.top < bounds.bottom && rect.bottom > bounds.top) {
        settle(element);
      } else {
        observer.observe(element);
      }
    });
  };

  panel.addEventListener('animationend', event => {
    if (event.animationName === 'ti-content-enter') event.target.classList.remove('ti-reveal-enter');
  });
  panel.addEventListener('focusin', event => {
    const element = event.target.closest('[data-ti-reveal]');
    if (element) settle(element);
  });
  desktop.addEventListener('change', connect);
  motion.addEventListener('change', connect);
  // Terrain owns this control; read its updated state after all click handlers run.
  motionToggle?.addEventListener('click', () => queueMicrotask(connect));
  window.addEventListener('pageshow', event => { if (event.persisted) connect(); });

  // Opened portfolio details inherit the same measured, row-specific stagger.
  panel.querySelectorAll('.more-websites').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) staggerRows(); });
  });
  connect();
})();
