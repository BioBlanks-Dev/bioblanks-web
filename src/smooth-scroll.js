/**
 * BioBlanks — smooth scroll (Lenis)
 *
 * Ported out of the Webflow site footer so the repo owns it. Previously the
 * footer created a Lenis instance in a script-scoped `let`, which nothing else
 * could reach — so when the PDP gallery grew the page after load, there was no
 * way to tell Lenis to re-measure and the scroll range stayed capped.
 *
 * Now the instance lives here and is exposed on `window.lenis`, so other
 * modules (pdp.js) can call `window.lenis.resize()` after they change the page
 * height. The Lenis config and the cart-open scroll lock are reproduced exactly
 * from the old footer code so site-wide behaviour is unchanged.
 *
 * NOTE: the matching Lenis `<script>` tag and init block were removed from the
 * Webflow site footer as part of this migration — running two Lenis instances
 * would fight over the wheel. The GSAP/ScrollTrigger animation engine stays in
 * Webflow; it never referenced the Lenis instance.
 */

const LENIS_SRC =
  'https://cdn.jsdelivr.net/gh/studio-freight/lenis@1.0.23/bundled/lenis.min.js';

// Load the same Lenis build the site already used. Reuse the global if some
// other script already loaded it, so we never create a second copy.
function loadLib() {
  if (window.Lenis) return Promise.resolve(window.Lenis);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LENIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Lenis));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = LENIS_SRC;
    s.onload = () => resolve(window.Lenis);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Reproduce the footer's cart-open scroll lock: on mobile, when the Fourthwall
// cart element opens, lock the body and stop Lenis; release otherwise.
function wireCartLock(lenis) {
  const cartElement = document.querySelector('[sf-cart]');
  if (!cartElement) return;
  const bodyClass = 'cart-is-active';
  const mq = window.matchMedia('(max-width: 767px)');

  const update = () => {
    const isMobile = mq.matches;
    const isOpen = cartElement.classList.contains('sf-cart-opened');
    if (isMobile && isOpen) {
      document.body.classList.add(bodyClass);
      lenis.stop();
      return;
    }
    document.body.classList.remove(bodyClass);
    lenis.start();
  };

  new MutationObserver(update).observe(cartElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  mq.addEventListener('change', update);
}

let started = false;

export default async function initSmoothScroll() {
  if (started || window.lenis) return;
  started = true;

  let Lenis;
  try {
    Lenis = await loadLib();
  } catch (err) {
    console.error('[BB] Lenis failed to load:', err);
    return;
  }
  if (!Lenis) return;

  const lenis = new Lenis({
    lerp: 0.1,
    wheelMultiplier: 0.7,
    gestureOrientation: 'vertical',
    normalizeWheel: false,
    smoothTouch: false,
  });

  // Exposed so page modules can re-measure after changing page height.
  window.lenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  wireCartLock(lenis);
}
