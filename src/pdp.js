/**
 * BioBlanks — PDP behaviour
 *
 * Runs only on product detail pages. It renders the interactive parts of the
 * panel and gallery from CMS data that Webflow prints into the page, so the
 * page still makes ZERO Fourthwall calls to render — price and variant IDs
 * come from the CMS at publish time. The Storefront API is only touched on
 * add-to-cart, via BBCart.
 *
 * ---------------------------------------------------------------------------
 * DOM / DATA CONTRACT  (what the Webflow Designer must provide)
 * ---------------------------------------------------------------------------
 * A single element carries the product's colorways as JSON, bound to the
 * product's "Colorways JSON" CMS field:
 *
 *   <div data-bb-colorways='[
 *     { "name": "Charcoal", "swatch": "#413f3f",
 *       "variants": { "XS": "<fw-variant-id>", ... },
 *       "gallery":  [ "<image-url>", ... ] },
 *     ...
 *   ]'></div>
 *
 * Everything else — swatch chips, the colorway label, the size grid, the
 * gallery and its thumbnail rail — is built here from that JSON, so it matches
 * the prototype exactly and stays versioned in this repo. Using one product
 * field (rather than a filtered Collection List) keeps the whole thing
 * headless: "Product = Current" filters can only be set in the Designer UI.
 *
 * The jobs beyond rendering:
 *   1. Show one action button at a time, based on the active tab
 *   2. Write the selected variant id onto .add-to-cart_button and wire BBCart
 *   3. Keep the thumbnail rail in sync with gallery scroll position
 */

import BBCart from './cart.js';

const SEL = {
  panel: '.product-header_content-inner-wrapper',
  tabsMenu: '.product-header_tabs-menu',
  tabLink: '.product-header_tab-link',
  tabLabel: '.text-tabs',
  addToCart: '.add-to-cart_button',
  projectLink: '.button-navbar',
  galleryColumn: '.product_swiper-left',
  colorwayData: '#bb-colorways, [data-bb-colorways]',
};

// Canonical size order. Sizes present in a colorway's variant map render in
// this order; anything not in the map renders disabled.
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

/* -------------------------------------------------------------------------
   State
   ------------------------------------------------------------------------- */

const state = {
  colorways: [],   // [{ name, swatch, variants: {size: id}, gallery: [url] }]
  activeColor: 0,
  activeSize: null,
};

const els = {}; // cached built elements

/* -------------------------------------------------------------------------
   Read colorway data printed by the CMS
   ------------------------------------------------------------------------- */

function parseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    console.warn('[PDP] could not parse colorway data:', err);
    return fallback;
  }
}

function readColorways() {
  const host = document.querySelector(SEL.colorwayData);
  if (!host) return { host: null, list: [] };

  // The host is a CMS-bound text element, so its JSON lives in textContent.
  // Fall back to the attribute in case a future host carries it there instead.
  const raw = (host.textContent && host.textContent.trim()) ||
              host.getAttribute('data-bb-colorways') || '';
  const arr = parseJSON(raw, []);

  const list = arr
    .map((cw) => ({
      name: (cw.name || '').trim(),
      swatch: (cw.swatch || '').trim(),
      variants: cw.variants || cw.variantMap || {},
      gallery: Array.isArray(cw.gallery) ? cw.gallery : [],
    }))
    .filter((cw) => cw.name);

  return { host, list };
}

/* -------------------------------------------------------------------------
   Panel controls — colorway heading + label, swatches, size grid
   All built inside the data host element, in prototype order.
   ------------------------------------------------------------------------- */

function buildPanelControls() {
  // The data host is a <script type="application/json">, so controls go in a
  // sibling container inserted right after it (in the Overview tab pane).
  const host = document.createElement('div');
  host.className = 'bb-panel-controls';
  els.dataHost.insertAdjacentElement('afterend', host);

  const colorHeading = document.createElement('h2');
  colorHeading.className = 'bb-panel-heading';
  colorHeading.textContent = 'Colorway';

  const colorNote = document.createElement('p');
  colorNote.className = 'bb-color-note';

  const swatches = document.createElement('div');
  swatches.className = 'bb-swatches';

  const sizeHeading = document.createElement('h2');
  sizeHeading.className = 'bb-panel-heading';
  sizeHeading.textContent = 'Size';

  const sizes = document.createElement('div');
  sizes.className = 'bb-sizes';

  host.append(colorHeading, colorNote, swatches, sizeHeading, sizes);
  els.colorNote = colorNote;
  els.swatches = swatches;
  els.sizes = sizes;
}

function renderSwatches() {
  const wrap = els.swatches;
  wrap.innerHTML = '';
  state.colorways.forEach((cw, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bb-swatch';
    chip.style.setProperty('--bb-swatch-color', cw.swatch || 'transparent');
    chip.setAttribute('aria-label', cw.name);
    chip.setAttribute('aria-pressed', String(i === state.activeColor));
    chip.addEventListener('click', () => selectColorway(i));
    wrap.appendChild(chip);
  });
}

function syncSwatches() {
  [...els.swatches.children].forEach((chip, i) => {
    chip.setAttribute('aria-pressed', String(i === state.activeColor));
  });
  if (els.colorNote) {
    els.colorNote.textContent = state.colorways[state.activeColor]?.name || '';
  }
}

function renderSizes() {
  const grid = els.sizes;
  const cw = state.colorways[state.activeColor];
  grid.innerHTML = '';

  SIZES.forEach((size) => {
    const variantId = cw?.variants?.[size];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bb-size';
    btn.textContent = size;
    btn.disabled = !variantId;
    btn.setAttribute('aria-pressed', String(state.activeSize === size));
    if (variantId) {
      btn.addEventListener('click', () => {
        state.activeSize = size;
        renderSizes();
        syncBuyButton();
      });
    }
    grid.appendChild(btn);
  });
}

/* -------------------------------------------------------------------------
   Gallery
   We own the gallery so it can swap per colorway. The native Webflow swiper
   gallery is hidden (kept in the DOM as a no-JS / crawler fallback).
   ------------------------------------------------------------------------- */

function buildGallery() {
  const column = document.querySelector(SEL.galleryColumn);
  if (!column) return;

  column.classList.add('bb-js-gallery');

  const rail = document.createElement('div');
  rail.className = 'bb-thumb-rail';
  const thumbs = document.createElement('div');
  thumbs.className = 'bb-thumbs';
  rail.appendChild(thumbs);

  const shots = document.createElement('div');
  shots.className = 'bb-shots';

  column.insertBefore(rail, column.firstChild);
  column.appendChild(shots);

  els.thumbs = thumbs;
  els.shots = shots;
}

function renderGallery() {
  if (!els.shots) return;
  const cw = state.colorways[state.activeColor];
  const images = cw?.gallery || [];

  els.shots.innerHTML = '';
  els.thumbs.innerHTML = '';

  images.forEach((src, i) => {
    const shot = document.createElement('div');
    shot.className = 'bb-shot';
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${cw.name} view ${i + 1}`;
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    shot.appendChild(img);
    els.shots.appendChild(shot);

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'bb-thumb';
    thumb.setAttribute('aria-label', `View image ${i + 1}`);
    thumb.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    const timg = document.createElement('img');
    timg.src = src;
    timg.alt = '';
    thumb.appendChild(timg);
    thumb.addEventListener('click', () =>
      shot.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
    els.thumbs.appendChild(thumb);
  });

  observeShots();
}

let shotObserver = null;

function observeShots() {
  if (shotObserver) shotObserver.disconnect();
  const shots = [...els.shots.querySelectorAll('.bb-shot')];
  const thumbs = [...els.thumbs.querySelectorAll('.bb-thumb')];
  if (!shots.length) return;

  shotObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = shots.indexOf(entry.target);
        thumbs.forEach((t, i) =>
          t.setAttribute('aria-current', i === idx ? 'true' : 'false')
        );
      });
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  shots.forEach((s) => shotObserver.observe(s));
}

/* -------------------------------------------------------------------------
   Selection + buy button
   ------------------------------------------------------------------------- */

function selectColorway(i) {
  if (i === state.activeColor) return;
  state.activeColor = i;
  state.activeSize = null;
  syncSwatches();
  renderSizes();
  renderGallery();
  syncBuyButton();
}

function syncBuyButton() {
  const button = document.querySelector(SEL.addToCart);
  if (!button) return;

  const cw = state.colorways[state.activeColor];
  const variantId = state.activeSize ? cw?.variants?.[state.activeSize] : null;

  if (variantId) {
    button.dataset.variantId = variantId;
    button.removeAttribute('disabled');
  } else {
    delete button.dataset.variantId;
    button.setAttribute('disabled', 'true');
  }
}

/* -------------------------------------------------------------------------
   Add to cart
   ------------------------------------------------------------------------- */

function wireAddToCart() {
  const button = document.querySelector(SEL.addToCart);
  if (!button) return;

  // Defensive: strip Storesynk's hook if the attribute lingers.
  button.removeAttribute('sf-add-to-cart');

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    const variantId = button.dataset.variantId;
    if (!variantId) return;

    button.setAttribute('disabled', 'true');
    button.classList.add('is-loading');
    try {
      await BBCart.addItem(variantId, 1);
    } catch (err) {
      console.error('[PDP] add to cart failed:', err);
    } finally {
      button.classList.remove('is-loading');
      syncBuyButton(); // re-enable only if a valid selection remains
    }
  });
}

/* -------------------------------------------------------------------------
   Action buttons — one visible per tab
   Overview / Materials / Size & Fit -> Add to Cart
   Customization                     -> Start New Project (Typeform)
   ------------------------------------------------------------------------- */

function tabName(link) {
  const label = link.querySelector(SEL.tabLabel) || link;
  return (label.textContent || '').trim().toLowerCase();
}

function syncActionButtons() {
  const current = document.querySelector(`${SEL.tabLink}.w--current`);
  if (!current) return;

  const isCustomization = tabName(current).includes('custom');
  const cart = document.querySelector(SEL.addToCart);
  const project = document.querySelector(SEL.projectLink);

  if (cart) cart.setAttribute('data-bb-hidden', String(isCustomization));
  if (project) project.setAttribute('data-bb-hidden', String(!isCustomization));
}

function watchTabs() {
  const menu = document.querySelector(SEL.tabsMenu);
  if (!menu) return;

  const observer = new MutationObserver(syncActionButtons);
  menu.querySelectorAll(SEL.tabLink).forEach((link) => {
    observer.observe(link, { attributes: true, attributeFilter: ['class'] });
  });
  syncActionButtons();
}

/* -------------------------------------------------------------------------
   Accordions
   Generic support for any element the Designer marks with [data-bb-acc].
   Bodies animate via grid-template-rows 0fr -> 1fr (see pdp.css).
   ------------------------------------------------------------------------- */

function wireAccordions() {
  document.querySelectorAll('[data-bb-acc]').forEach((acc) => {
    const head = acc.querySelector('[data-bb-acc-head]');
    if (!head) return;
    head.addEventListener('click', () => {
      const open = !acc.hasAttribute('open');
      acc.toggleAttribute('open', open);
      head.setAttribute('aria-expanded', String(open));
    });
  });
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

export default function initPDP() {
  if (!document.querySelector(SEL.panel)) return; // not a PDP

  watchTabs();
  wireAccordions();
  wireAddToCart();

  const { host, list } = readColorways();
  state.colorways = list;

  if (host && list.length) {
    els.dataHost = host;
    buildPanelControls();
    renderSwatches();
    buildGallery();
    syncSwatches();
    renderSizes();
    renderGallery();
    syncBuyButton();
  } else {
    console.warn('[PDP] no [data-bb-colorways] data found — panel controls not built.');
  }

  BBCart.on('cartUpdate', () => {
    document.querySelectorAll('[data-bb-cart-count]').forEach((el) => {
      el.textContent = BBCart.itemCount();
    });
  });
}
