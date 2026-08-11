/**
 * BioBlanks — Fourthwall cart
 *
 * Replaces the Shopyflow cart layer. Talks to the Fourthwall Storefront API,
 * keeps the cart id in localStorage, and emits events the PDP can listen to.
 *
 * The storefront token is publishable by design — it is meant to be visible
 * in client-side code. Rotate it in Fourthwall → Settings → For Developers
 * → Headless if you ever need to.
 */

const CONFIG = {
  token: 'ptkn_15531f83-e03e-46c2-8459-518d1e542bf0',
  apiBase: 'https://storefront-api.fourthwall.com/v1',
  checkoutDomain: 'checkout.bioblanks.com',
  currency: 'USD',
  storageKey: 'bb_cart_id',
  countKey: 'bb_cart_count',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cart = null;
const listeners = new Map();

function getCartId() {
  try {
    return localStorage.getItem(CONFIG.storageKey);
  } catch {
    return null; // private browsing, storage disabled
  }
}

function setCartId(id) {
  try {
    if (id) localStorage.setItem(CONFIG.storageKey, id);
    else localStorage.removeItem(CONFIG.storageKey);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Events
//
// Usage from Webflow page code:
//   BBCart.on('cartUpdate', ({ cart, type }) => { ... })
//
// This mirrors the old Shopyflow.on('cartUpdate') signature so existing
// page-level code needs only the object name changed.
// ---------------------------------------------------------------------------

function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

function emit(event, payload) {
  // Cache the item count so the nav badge can render instantly on the next
  // load, before the cart fetch resolves — no flash, no reset.
  if (event === 'cartUpdate' || event === 'ready') {
    try {
      localStorage.setItem(CONFIG.countKey, String(itemCount()));
    } catch {
      /* ignore */
    }
  }
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[BBCart] listener for "${event}" threw:`, err);
    }
  });
  // Also fire a DOM event so non-module code can listen without a reference.
  document.dispatchEvent(new CustomEvent(`bb:${event}`, { detail: payload }));
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function endpoint(path) {
  return `${CONFIG.apiBase}${path}?storefront_token=${CONFIG.token}`;
}

async function request(path, body) {
  const res = await fetch(endpoint(path), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`Fourthwall ${res.status}: ${text || res.statusText}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Cart operations
// ---------------------------------------------------------------------------

async function createCart(items = []) {
  cart = await request('/carts', { items });
  setCartId(cart.id);
  emit('cartUpdate', { cart, type: 'create' });
  return cart;
}

/**
 * Loads the stored cart. If the id is stale (cart expired or deleted on
 * Fourthwall's side) it clears it rather than leaving the site in a broken
 * state — the next add creates a fresh cart.
 */
async function loadCart() {
  const id = getCartId();
  if (!id) return null;

  try {
    cart = await request(`/carts/${id}`);
    emit('cartUpdate', { cart, type: 'load' });
    return cart;
  } catch (err) {
    console.warn('[BBCart] stored cart is no longer valid, clearing it.', err);
    setCartId(null);
    cart = null;
    return null;
  }
}

async function addItem(variantId, quantity = 1) {
  if (!variantId) throw new Error('[BBCart] addItem requires a variantId');

  const id = getCartId();
  if (!id) return createCart([{ variantId, quantity }]);

  try {
    cart = await request(`/carts/${id}/add`, { items: [{ variantId, quantity }] });
  } catch (err) {
    // Stale cart id — start a new one rather than failing the add.
    if (err.status === 404) {
      setCartId(null);
      return createCart([{ variantId, quantity }]);
    }
    throw err;
  }

  emit('cartUpdate', { cart, type: 'add' });
  return cart;
}

async function updateQuantity(variantId, quantity) {
  const id = getCartId();
  if (!id) return null;

  cart = await request(`/carts/${id}/change`, {
    items: [{ variantId, quantity }],
  });
  emit('cartUpdate', { cart, type: 'change' });
  return cart;
}

async function removeItem(variantId) {
  const id = getCartId();
  if (!id) return null;

  cart = await request(`/carts/${id}/remove`, {
    items: [{ variantId }],
  });
  emit('cartUpdate', { cart, type: 'remove' });
  return cart;
}

async function clearCart() {
  setCartId(null);
  cart = null;
  emit('cartUpdate', { cart: null, type: 'clear' });
}

// ---------------------------------------------------------------------------
// Helpers for UI
// ---------------------------------------------------------------------------

function getCart() {
  return cart;
}

function itemCount() {
  if (!cart?.items) return 0;
  return cart.items.reduce((total, item) => total + (item.quantity || 0), 0);
}

// Last-known count from a previous load, read synchronously so the nav badge
// can paint immediately without waiting on the network.
function cachedCount() {
  try {
    const v = parseInt(localStorage.getItem(CONFIG.countKey), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function subtotal() {
  if (!cart?.items) return 0;
  return cart.items.reduce((total, item) => {
    const price = item.variant?.unitPrice?.value || 0;
    return total + price * (item.quantity || 0);
  }, 0);
}

function formatPrice(value, currency = CONFIG.currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

function checkoutUrl() {
  const id = getCartId();
  if (!id) return null;
  return `https://${CONFIG.checkoutDomain}/checkout/?cartCurrency=${CONFIG.currency}&cartId=${id}`;
}

function goToCheckout() {
  const url = checkoutUrl();
  if (!url) {
    console.warn('[BBCart] no cart to check out.');
    return;
  }
  emit('checkoutStart', { cart });
  window.location.href = url;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  await loadCart();
  emit('ready', { cart });
  return cart;
}

const BBCart = {
  init,
  on,
  off,
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  itemCount,
  cachedCount,
  subtotal,
  formatPrice,
  checkoutUrl,
  goToCheckout,
  config: CONFIG,
};

export default BBCart;
