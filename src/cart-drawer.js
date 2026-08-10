/**
 * BioBlanks — cart drawer
 *
 * Replaces the cart drawer Storesynk used to inject at runtime. It renders
 * straight from the Fourthwall cart response that BBCart holds — the verified
 * shape gives each line item the whole nested `variant` (attributes, unitPrice,
 * images) plus the parent `product`, so the drawer needs no local state of its
 * own. It just re-renders on every BBCart 'cartUpdate'.
 *
 * Triggers:
 *   - any element with [data-bb-cart-toggle] opens the drawer on click
 *   - it opens automatically when an item is added
 *   - [data-bb-cart-count] elements are kept in sync with the item count
 */

import BBCart from './cart.js';

let root = null;
let elItems = null;
let elSubtotal = null;
let elCheckout = null;
let built = false;

/* -------------------------------------------------------------------------
   Build
   ------------------------------------------------------------------------- */

function build() {
  if (built) return;
  built = true;

  root = document.createElement('div');
  root.className = 'bb-drawer';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="bb-drawer_overlay" data-bb-drawer-close></div>
    <aside class="bb-drawer_panel" role="dialog" aria-modal="true" aria-label="Cart">
      <header class="bb-drawer_head">
        <span class="bb-drawer_title">Cart</span>
        <button type="button" class="bb-drawer_close" data-bb-drawer-close aria-label="Close cart">&times;</button>
      </header>
      <div class="bb-drawer_items"></div>
      <footer class="bb-drawer_foot">
        <div class="bb-drawer_subtotal-row">
          <span>Subtotal</span>
          <span class="bb-drawer_subtotal">$0.00</span>
        </div>
        <button type="button" class="bb-drawer_checkout" disabled>Checkout</button>
        <p class="bb-drawer_note">Shipping and taxes calculated at checkout.</p>
      </footer>
    </aside>
  `;
  document.body.appendChild(root);

  elItems = root.querySelector('.bb-drawer_items');
  elSubtotal = root.querySelector('.bb-drawer_subtotal');
  elCheckout = root.querySelector('.bb-drawer_checkout');

  root.querySelectorAll('[data-bb-drawer-close]').forEach((el) =>
    el.addEventListener('click', close)
  );
  elCheckout.addEventListener('click', () => BBCart.goToCheckout());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/* -------------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------------- */

function open() {
  build();
  render(BBCart.getCart());
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('bb-drawer-lock');
  // Lenis intercepts the wheel, so overflow:hidden alone won't stop the page
  // scrolling behind the drawer — pause it explicitly.
  try { window.lenis?.stop?.(); } catch (e) {}
}

function close() {
  if (!root) return;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('bb-drawer-lock');
  try { window.lenis?.start?.(); } catch (e) {}
}

/* -------------------------------------------------------------------------
   Render
   ------------------------------------------------------------------------- */

function variantLabel(variant) {
  const attrs = variant?.attributes || {};
  const parts = [];
  if (attrs.color?.name) parts.push(attrs.color.name);
  if (attrs.size?.name) parts.push(attrs.size.name);
  return parts.join(' / ');
}

function variantImage(item) {
  const img = item.variant?.images?.[0];
  return img?.url || img?.originalUrl || item.product?.images?.[0]?.url || '';
}

function render(cart) {
  syncCount(cart);
  if (!elItems) return;

  const items = cart?.items || [];

  if (!items.length) {
    elItems.innerHTML = '<p class="bb-drawer_empty">Your cart is empty.</p>';
    elSubtotal.textContent = BBCart.formatPrice(0);
    elCheckout.disabled = true;
    return;
  }

  elItems.innerHTML = items
    .map((item) => {
      const variant = item.variant || {};
      const price = variant.unitPrice?.value || 0;
      const currency = variant.unitPrice?.currency;
      const title = item.product?.name || variant.name || 'Item';
      const img = variantImage(item);
      const vid = variant.id || '';
      return `
        <div class="bb-line" data-variant-id="${vid}">
          <div class="bb-line_media">${img ? `<img src="${img}" alt="">` : ''}</div>
          <div class="bb-line_body">
            <div class="bb-line_title">${title}</div>
            <div class="bb-line_variant">${variantLabel(variant)}</div>
            <div class="bb-line_controls">
              <div class="bb-qty">
                <button type="button" class="bb-qty_btn" data-bb-qty="dec" aria-label="Decrease quantity">&minus;</button>
                <span class="bb-qty_value">${item.quantity || 0}</span>
                <button type="button" class="bb-qty_btn" data-bb-qty="inc" aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="bb-line_remove" data-bb-remove aria-label="Remove item">Remove</button>
            </div>
          </div>
          <div class="bb-line_price">${BBCart.formatPrice(price * (item.quantity || 0), currency)}</div>
        </div>
      `;
    })
    .join('');

  wireLineControls();

  elSubtotal.textContent = BBCart.formatPrice(BBCart.subtotal());
  elCheckout.disabled = false;
}

function wireLineControls() {
  elItems.querySelectorAll('.bb-line').forEach((line) => {
    const variantId = line.dataset.variantId;
    const qty = parseInt(line.querySelector('.bb-qty_value').textContent, 10) || 0;

    line.querySelector('[data-bb-qty="inc"]').addEventListener('click', () =>
      guard(() => BBCart.updateQuantity(variantId, qty + 1))
    );
    line.querySelector('[data-bb-qty="dec"]').addEventListener('click', () => {
      if (qty <= 1) return guard(() => BBCart.removeItem(variantId));
      guard(() => BBCart.updateQuantity(variantId, qty - 1));
    });
    line.querySelector('[data-bb-remove]').addEventListener('click', () =>
      guard(() => BBCart.removeItem(variantId))
    );
  });
}

async function guard(fn) {
  root.classList.add('is-busy');
  try {
    await fn();
  } catch (err) {
    console.error('[BBCart drawer] update failed:', err);
  } finally {
    root.classList.remove('is-busy');
  }
}

function syncCount(cart) {
  const count = cart?.items
    ? cart.items.reduce((t, i) => t + (i.quantity || 0), 0)
    : 0;
  document.querySelectorAll('[data-bb-cart-count]').forEach((el) => {
    el.textContent = count;
    el.toggleAttribute('data-bb-empty', count === 0);
  });
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

export default function initCartDrawer() {
  // Delegate so triggers work even if the nav is injected after load.
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-bb-cart-toggle]');
    if (toggle) {
      e.preventDefault();
      open();
    }
  });

  BBCart.on('cartUpdate', ({ cart, type }) => {
    if (built) render(cart);
    else syncCount(cart);
    if (type === 'add') open(); // surface the drawer when something is added
  });

  BBCart.on('ready', ({ cart }) => syncCount(cart));
}
