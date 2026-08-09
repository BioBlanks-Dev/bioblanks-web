/**
 * BioBlanks — entry point
 *
 * Loaded by the BioBlanksGitHubLoader script registered in Webflow.
 * Everything the site needs gets imported and wired up here.
 */

import BBCart from './cart.js';

// Expose globally so page-level custom code in Webflow can reach it.
// Module scope is isolated, so without this the inline scripts in
// Webflow's page settings could not see the cart.
window.BBCart = BBCart;

BBCart.init()
  .then((cart) => {
    console.log('BioBlanks cart ready.', cart ? `${BBCart.itemCount()} item(s)` : 'empty');
  })
  .catch((err) => {
    console.error('BioBlanks cart failed to initialise:', err);
  });
