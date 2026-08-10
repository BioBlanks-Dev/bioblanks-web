/**
 * BioBlanks — entry point
 *
 * Loaded by the BioBlanksGitHubLoader script registered in Webflow.
 * Everything the site needs gets imported and wired up here.
 */

import BBCart from './cart.js';
import initPDP from './pdp.js';
import initCartDrawer from './cart-drawer.js';

// Resolve sibling files relative to whatever version of this module was
// loaded. Pointing the Webflow loader at @v1.2.3 therefore also loads the
// stylesheet from @v1.2.3 — no hardcoded version to fall out of sync.
const HERE = new URL('.', import.meta.url).href;

// Stylesheets live alongside the modules. Loading from here rather than
// Webflow's custom code keeps everything versioned in one place.
function loadStyles(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

loadStyles(`${HERE}pdp.css`);
loadStyles(`${HERE}cart-drawer.css`);

// Expose globally so page-level custom code in Webflow can reach it.
window.BBCart = BBCart;

// The cart drawer listens for BBCart events, so wire it before init() runs.
initCartDrawer();

BBCart.init()
  .then(() => {
    console.log('BioBlanks cart ready —', BBCart.itemCount(), 'item(s)');
  })
  .catch((err) => {
    console.error('BioBlanks cart failed to initialise:', err);
  });

initPDP();
