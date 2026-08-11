/**
 * BioBlanks — entry point
 *
 * Loaded by the BioBlanksGitHubLoader script registered in Webflow.
 * Everything the site needs gets imported and wired up here.
 */

import BBCart from './cart.js';
import initPDP from './pdp.js';
import initCartDrawer from './cart-drawer.js';
import initSmoothScroll from './smooth-scroll.js';

// Resolve sibling files relative to whatever version of this module was
// loaded. Pointing the Webflow loader at @v1.2.3 therefore also loads the
// stylesheet from @v1.2.3 — no hardcoded version to fall out of sync.
const HERE = new URL('.', import.meta.url).href;

// Load a stylesheet and resolve once it has actually applied (or failed). The
// PDP reveal is gated on this so the stock Webflow layout can't flash between
// the DOM build and the CSS becoming active.
function loadStyles(href) {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // never block the reveal on a CSS failure
    document.head.appendChild(link);
  });
}

// Kick the stylesheet fetches off immediately — <head> exists during parsing,
// so this starts as early as the module runs (earlier when loaded in <head>).
const cssReady = Promise.all([
  loadStyles(`${HERE}pdp.css`),
  loadStyles(`${HERE}cart-drawer.css`),
]);

// Expose globally so page-level custom code in Webflow can reach it.
window.BBCart = BBCart;

function boot() {
  // Smooth scroll (Lenis) is owned by the repo now.
  initSmoothScroll();

  // The cart drawer listens for BBCart events, so wire it before init() runs.
  initCartDrawer();

  BBCart.init()
    .then(() => {
      console.log('BioBlanks cart ready —', BBCart.itemCount(), 'item(s)');
    })
    .catch((err) => {
      console.error('BioBlanks cart failed to initialise:', err);
    });

  try {
    initPDP();
  } catch (err) {
    console.error('BioBlanks PDP init failed:', err);
  }

  // Reveal the PDP only once our stylesheet has applied AND the DOM is built,
  // so nothing shows until it's fully ours. The <head> anti-flicker rule keeps
  // .product-header_component hidden until this class lands.
  cssReady.then(() =>
    requestAnimationFrame(() =>
      document.documentElement.classList.add('bb-pdp-ready')
    )
  );
}

// Works whether the loader is in <head> (module may run before the body is
// parsed) or the footer: DOM-dependent work always waits for a ready DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
