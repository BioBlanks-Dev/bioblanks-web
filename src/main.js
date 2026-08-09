/**
 * BioBlanks — entry point
 *
 * Loaded by the BioBlanksGitHubLoader script registered in Webflow.
 * Everything the site needs gets imported and wired up here.
 */

import BBCart from './cart.js';
import initPDP from './pdp.js';

const REPO = 'https://cdn.jsdelivr.net/gh/BioBlanks-Dev/bioblanks-web@main/src';

// Stylesheets live alongside the modules. Loading from here rather than
// Webflow's custom code keeps everything versioned in one place.
function loadStyles(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

loadStyles(`${REPO}/pdp.css`);

// Expose globally so page-level custom code in Webflow can reach it.
window.BBCart = BBCart;

BBCart.init()
  .then(() => {
    console.log('BioBlanks cart ready —', BBCart.itemCount(), 'item(s)');
  })
  .catch((err) => {
    console.error('BioBlanks cart failed to initialise:', err);
  });

initPDP();
