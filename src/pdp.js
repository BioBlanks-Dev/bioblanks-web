/**
 * BioBlanks — PDP behaviour
 *
 * Runs only on product detail pages. Three jobs:
 *   1. Show one action button at a time, based on the active tab
 *   2. Keep the thumbnail rail in sync with gallery scroll position
 *   3. Wire add-to-cart to BBCart
 *
 * Webflow's native Tabs handle the actual tab switching — this only
 * reacts to it by watching for the .w--current class.
 */

import BBCart from './cart.js';

const SEL = {
  panel: '.product-header_content-inner-wrapper',
  tabLink: '.product-header_tab-link',
  tabLabel: '.text-tabs',
  actions: '.product-actions_wrap',
  addToCart: '.add-to-cart_button',
  projectLink: '.button-navbar',
  slide: '.product_swiper-left .swiper-slide.is-slider',
  rail: '.product_thumb-rail',
  thumb: '.product_thumb-rail .w-dyn-item',
};

/* -------------------------------------------------------------------------
   Action buttons
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
  const menu = document.querySelector('.product-header_tabs-menu');
  if (!menu) return;

  // Webflow toggles .w--current on click; a class observer is more reliable
  // than a click handler because it also catches programmatic tab changes.
  const observer = new MutationObserver(syncActionButtons);
  menu.querySelectorAll(SEL.tabLink).forEach((link) => {
    observer.observe(link, { attributes: true, attributeFilter: ['class'] });
  });

  syncActionButtons();
}

/* -------------------------------------------------------------------------
   Thumbnail rail
   ------------------------------------------------------------------------- */

function wireThumbnails() {
  const slides = [...document.querySelectorAll(SEL.slide)];
  const thumbs = [...document.querySelectorAll(SEL.thumb)];
  if (!slides.length || !thumbs.length) return;

  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', () => {
      slides[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  const setActive = (index) => {
    thumbs.forEach((t, i) => t.classList.toggle('is-active', i === index));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setActive(slides.indexOf(entry.target));
      });
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );

  slides.forEach((slide) => observer.observe(slide));
  setActive(0);
}

/* -------------------------------------------------------------------------
   Lazy loading
   Only the first gallery image should block first paint.
   ------------------------------------------------------------------------- */

function deferOffscreenImages() {
  document.querySelectorAll(`${SEL.slide} img`).forEach((img, i) => {
    img.setAttribute('loading', i === 0 ? 'eager' : 'lazy');
    img.setAttribute('decoding', 'async');
  });
}

/* -------------------------------------------------------------------------
   Add to cart
   ------------------------------------------------------------------------- */

function wireAddToCart() {
  const button = document.querySelector(SEL.addToCart);
  if (!button) return;

  // Storesynk's hook — harmless once removed, defensive if it lingers
  button.removeAttribute('sf-add-to-cart');

  button.addEventListener('click', async (event) => {
    event.preventDefault();

    const variantId = button.dataset.variantId;
    if (!variantId) {
      console.warn('[PDP] no variant selected.');
      return;
    }

    button.disabled = true;
    try {
      await BBCart.addItem(variantId, 1);
    } catch (err) {
      console.error('[PDP] add to cart failed:', err);
    } finally {
      button.disabled = false;
    }
  });
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

export default function initPDP() {
  if (!document.querySelector(SEL.panel)) return; // not a PDP

  watchTabs();
  wireThumbnails();
  deferOffscreenImages();
  wireAddToCart();

  BBCart.on('cartUpdate', ({ cart }) => {
    document.querySelectorAll('[data-bb-cart-count]').forEach((el) => {
      el.textContent = BBCart.itemCount();
    });
    if (cart) console.log('[PDP] cart updated:', BBCart.itemCount(), 'item(s)');
  });
}
