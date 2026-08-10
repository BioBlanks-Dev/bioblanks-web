/**
 * BioBlanks — PDP behaviour
 *
 * Runs only on product detail pages. It renders the Overview panel and the
 * gallery from CMS data that Webflow prints into the page, so the page makes
 * ZERO Fourthwall calls to render — price and variant IDs come from the CMS at
 * publish time. The Storefront API is only touched on add-to-cart, via BBCart.
 *
 * ---------------------------------------------------------------------------
 * DOM / DATA CONTRACT  (what the Webflow Designer must provide)
 * ---------------------------------------------------------------------------
 * Two hidden text elements carry JSON, each bound to a Product CMS field so it
 * resolves per current product (a CMS-bound text node is the only reliable way
 * to print CMS JSON headlessly — attribute and embed-token bindings don't):
 *
 *   #bb-pdp        -> "PDP JSON" field:
 *     { title, sku, description, samplePrice,
 *       productDetails: [ "...", ... ],
 *       wholesale: { price, unit, note, calcUrl } }
 *
 *   #bb-colorways  -> "Colorways JSON" field:
 *     [ { name, swatch, variants: { size: variantId }, gallery: [url] }, ... ]
 *
 * Everything visible in the Overview panel and the gallery is built here from
 * that JSON, matching the prototype. The page's own Overview content blocks are
 * hidden in the Designer so this owns the panel.
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
  pdpData: '#bb-pdp, [data-bb-pdp]',
  colorwayData: '#bb-colorways, [data-bb-colorways]',
};

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

const state = {
  pdp: {},
  colorways: [],
  activeColor: 0,
  activeSize: null,
};

const els = {};

/* -------------------------------------------------------------------------
   Read CMS-printed JSON
   ------------------------------------------------------------------------- */

function parseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    console.warn('[PDP] could not parse data:', err);
    return fallback;
  }
}

function readData() {
  const pdpHost = document.querySelector(SEL.pdpData);
  const cwHost = document.querySelector(SEL.colorwayData);
  els.anchor = pdpHost || cwHost;

  state.pdp = parseJSON(pdpHost && pdpHost.textContent.trim(), {}) || {};

  const cwRaw = cwHost && cwHost.textContent.trim();
  const arr = parseJSON(cwRaw, []) || [];
  state.colorways = arr
    .map((cw) => ({
      name: (cw.name || '').trim(),
      swatch: (cw.swatch || '').trim(),
      variants: cw.variants || cw.variantMap || {},
      gallery: Array.isArray(cw.gallery) ? cw.gallery : [],
    }))
    .filter((cw) => cw.name);
}

/* -------------------------------------------------------------------------
   Small DOM helpers
   ------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildAccordion(title, bodyNode) {
  const acc = el('div', 'bb-acc');
  acc.setAttribute('data-bb-acc', '');

  const head = el('button', 'bb-acc-head');
  head.type = 'button';
  head.setAttribute('data-bb-acc-head', '');
  head.setAttribute('aria-expanded', 'false');
  const sign = el('span', 'bb-acc-sign');
  sign.setAttribute('aria-hidden', 'true');
  head.append(sign, el('span', null, title));

  const body = el('div', 'bb-acc-body');
  body.setAttribute('data-bb-acc-body', '');
  const inner = el('div', 'bb-acc-inner');
  inner.append(bodyNode);
  body.append(inner);

  head.addEventListener('click', () => {
    const open = !acc.hasAttribute('open');
    acc.toggleAttribute('open', open);
    head.setAttribute('aria-expanded', String(open));
  });

  acc.append(head, body);
  return acc;
}

/* -------------------------------------------------------------------------
   Overview panel — built from the PDP + colorways JSON, in prototype order
   ------------------------------------------------------------------------- */

function buildPanel() {
  const pdp = state.pdp;
  const host = el('div', 'bb-panel-controls');
  els.anchor.insertAdjacentElement('afterend', host);

  // Title + price
  const titleRow = el('div', 'bb-title-row');
  titleRow.append(el('h1', 'bb-title', pdp.title || ''));
  if (pdp.samplePrice) titleRow.append(el('div', 'bb-price', pdp.samplePrice));
  host.append(titleRow);

  if (pdp.sku) host.append(el('p', 'bb-sku', pdp.sku));
  if (pdp.description) host.append(el('p', 'bb-desc', pdp.description));

  // Product Details accordion
  if (Array.isArray(pdp.productDetails) && pdp.productDetails.length) {
    const ul = el('ul', 'bb-bullets');
    pdp.productDetails.forEach((b) => ul.append(el('li', null, b)));
    host.append(buildAccordion('Product Details', ul));
  }

  // Wholesale Pricing accordion
  if (pdp.wholesale) {
    const w = pdp.wholesale;
    const body = el('div');
    const line = el('div', 'bb-price-line');
    line.append(el('span', null, `Starting at ${w.price || ''} ${w.unit || ''}`.trim()));
    if (w.calcUrl) {
      const a = el('a', 'bb-link', 'Pricing calculator');
      a.href = w.calcUrl;
      line.append(a);
    }
    body.append(line);
    if (w.note) body.append(el('p', 'bb-note', w.note));
    host.append(buildAccordion('Wholesale Pricing', body));
  }

  // Colorway
  host.append(el('h2', 'bb-panel-heading', 'Colorway'));
  els.colorNote = el('p', 'bb-color-note', '');
  host.append(els.colorNote);
  els.swatches = el('div', 'bb-swatches');
  host.append(els.swatches);

  // Size
  host.append(el('h2', 'bb-panel-heading', 'Size'));
  els.sizes = el('div', 'bb-sizes');
  host.append(els.sizes);
}

/* -------------------------------------------------------------------------
   Breadcrumb — placed above the tabs inside the panel (prototype layout)
   ------------------------------------------------------------------------- */

function buildBreadcrumb() {
  const bc = state.pdp.breadcrumb;
  const panel = document.querySelector(SEL.panel);
  if (!bc || !panel) return;
  const tabs = panel.querySelector('.product-header_tabs');
  if (!tabs) return;

  const nav = el('p', 'bb-breadcrumb');
  if (bc.category) {
    const a = el('a', 'bb-breadcrumb-link', bc.category);
    a.href = bc.categoryUrl || '#';
    nav.append(a);
    nav.append(el('span', 'bb-breadcrumb-sep', ' • '));
  }
  nav.append(el('span', 'bb-breadcrumb-current', state.pdp.title || ''));
  panel.insertBefore(nav, tabs);
}

/* -------------------------------------------------------------------------
   Consistent title + SKU header on every tab (price only on Overview, which
   gets its header from buildPanel). The other panes' own title/SKU blocks are
   hidden in the Designer so these don't duplicate.
   ------------------------------------------------------------------------- */

function buildTabHeaders() {
  const panel = document.querySelector(SEL.panel);
  if (!panel || !state.pdp.title) return;
  const panes = [...panel.querySelectorAll('.product-header_tab-details')];
  panes.forEach((pane, i) => {
    if (i === 0) return; // Overview already has its header from buildPanel
    const header = el('div', 'bb-tab-header');
    const row = el('div', 'bb-title-row');
    row.append(el('h1', 'bb-title', state.pdp.title));
    header.append(row);
    if (state.pdp.sku) header.append(el('p', 'bb-sku', state.pdp.sku));
    pane.prepend(header);
  });
}

/* -------------------------------------------------------------------------
   Materials tab — Composition (fiber icon + name + %), fabric specs
   (Weight / Yarn) and the Traceability chain, all from CMS (pdp-json,
   regenerated from the real Product fields). Matches the prototype.

   The tab's original Webflow content (an icon list + an empty details
   accordion, which also contains the legacy traceability anchor) is hidden
   here so this owns the whole tab. Nothing is rendered — and nothing is
   hidden — for products that don't yet have this data, so unmigrated
   products keep their existing content.
   ------------------------------------------------------------------------- */

function findMaterialsPane() {
  const panel = document.querySelector(SEL.panel);
  if (!panel) return null;
  const panes = [...panel.querySelectorAll('.product-header_tab-details')];
  const links = [...panel.querySelectorAll(SEL.tabLink)];
  const idx = links.findIndex((l) =>
    (l.textContent || '').trim().toLowerCase().includes('material')
  );
  if (idx >= 0 && panes[idx]) return panes[idx];
  return panes[2] || null; // tab order: Overview, Customization, Materials, Size & Fit
}

function specRow(label, value) {
  const row = el('div', 'bb-comp-row bb-spec-row');
  row.append(el('span', 'bb-comp-name', label));
  row.append(el('span', 'bb-comp-val', value));
  return row;
}

function buildMaterials() {
  const pane = findMaterialsPane();
  if (!pane) return;

  const mat = state.pdp.materials;
  const trace = state.pdp.traceability;
  const hasComposition = mat && Array.isArray(mat.composition) && mat.composition.length;
  const hasTrace = Array.isArray(trace) && trace.length;
  if (!mat && !hasTrace) return; // no CMS data — leave the original tab as-is

  // Replace the original Webflow materials/details content with ours.
  [...pane.children].forEach((child) => {
    if (!child.classList.contains('bb-tab-header') && !child.classList.contains('bb-materials')) {
      child.style.display = 'none';
    }
  });

  const wrap = el('div', 'bb-materials');

  if (mat && mat.blurb) wrap.append(el('p', 'bb-desc', mat.blurb));

  if (hasComposition || (mat && (mat.weight || mat.yarn))) {
    wrap.append(el('h2', 'bb-panel-heading', 'Composition'));
    const list = el('div', 'bb-comp');
    if (hasComposition) {
      mat.composition.forEach((c) => {
        const row = el('div', 'bb-comp-row');
        const left = el('div', 'bb-comp-left');
        if (c.icon) {
          const ic = el('img', 'bb-comp-icon');
          ic.src = c.icon;
          ic.alt = '';
          ic.loading = 'lazy';
          left.append(ic);
        }
        left.append(el('span', 'bb-comp-name', c.name || ''));
        row.append(left);
        row.append(el('span', 'bb-comp-val', c.pct || ''));
        list.append(row);
      });
    }
    if (mat && mat.weight) list.append(specRow('Weight', mat.weight));
    if (mat && mat.yarn) list.append(specRow('Yarn', mat.yarn));
    wrap.append(list);
  }

  if (hasTrace) {
    wrap.append(el('h2', 'bb-panel-heading', 'Traceability'));
    const ul = el('ul', 'bb-chain');
    trace.forEach((t) => ul.append(el('li', null, t)));
    wrap.append(ul);
  }

  pane.append(wrap);
}

/* -------------------------------------------------------------------------
   Size & Fit tab — drop the Fit Guide blocks, keep the Measurements table,
   and bump its heading to 14px so it matches the other section headers.
   Scoped to this pane so shared Webflow utility classes elsewhere are safe.
   ------------------------------------------------------------------------- */

function findSizeFitPane() {
  const panel = document.querySelector(SEL.panel);
  if (!panel) return null;
  const panes = [...panel.querySelectorAll('.product-header_tab-details')];
  const links = [...panel.querySelectorAll(SEL.tabLink)];
  const idx = links.findIndex((l) => /size|fit/i.test(l.textContent || ''));
  if (idx >= 0 && panes[idx]) return panes[idx];
  return panes[3] || null; // tab order: Overview, Customization, Materials, Size & Fit
}

function buildSizeFit() {
  const pane = findSizeFitPane();
  if (!pane) return;

  const blocks = [...pane.children].filter((c) => !c.classList.contains('bb-tab-header'));
  const measurements = blocks.find((c) =>
    (c.textContent || '').trim().toLowerCase().startsWith('measurement')
  );
  if (!measurements) return; // unexpected layout — leave the tab untouched

  blocks.forEach((block) => {
    if (block !== measurements) {
      block.style.display = 'none'; // Fit Guide blocks
      return;
    }
    // Match the other section headers: bump the "Measurements" heading to 14px.
    [...block.querySelectorAll('*')].forEach((n) => {
      const own = [...n.childNodes]
        .filter((x) => x.nodeType === 3)
        .map((x) => x.textContent)
        .join('')
        .trim();
      if (/^measurements$/i.test(own)) n.style.fontSize = '14px';
    });
  });
}

/* -------------------------------------------------------------------------
   Swatches (image thumbnails) + size grid
   ------------------------------------------------------------------------- */

function renderSwatches() {
  const wrap = els.swatches;
  wrap.innerHTML = '';
  state.colorways.forEach((cw, i) => {
    const chip = el('button', 'bb-swatch');
    chip.type = 'button';
    chip.setAttribute('aria-label', cw.name);
    chip.setAttribute('aria-pressed', String(i === state.activeColor));
    const img = el('img');
    img.src = cw.gallery[0] || '';
    img.alt = '';
    img.loading = 'lazy';
    chip.append(img);
    chip.addEventListener('click', () => selectColorway(i));
    wrap.append(chip);
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
    const btn = el('button', 'bb-size', size);
    btn.type = 'button';
    btn.disabled = !variantId;
    btn.setAttribute('aria-pressed', String(state.activeSize === size));
    if (variantId) {
      btn.addEventListener('click', () => {
        state.activeSize = size;
        renderSizes();
        syncBuyButton();
      });
    }
    grid.append(btn);
  });
}

/* -------------------------------------------------------------------------
   Gallery — JS-owned vertical stack + thumbnail rail, swaps per colorway
   ------------------------------------------------------------------------- */

function buildGallery() {
  const column = document.querySelector(SEL.galleryColumn);
  if (!column) return;
  column.classList.add('bb-js-gallery');

  const rail = el('div', 'bb-thumb-rail');
  els.thumbs = el('div', 'bb-thumbs');
  rail.append(els.thumbs);

  els.shots = el('div', 'bb-shots');
  column.insertBefore(rail, column.firstChild);
  column.append(els.shots);

  // The gallery grows the page after Lenis/ScrollTrigger have cached the
  // document height, so nudge them to re-measure a few times as late assets
  // (fonts, lazy images) settle. window 'load' may already have fired by the
  // time this module runs, so schedule the nudges unconditionally.
  [200, 600, 1200].forEach((t) => setTimeout(recomputeScroll, t));
  window.addEventListener('load', recomputeScroll, { once: true });
}

function renderGallery() {
  if (!els.shots) return;
  const cw = state.colorways[state.activeColor];
  const images = cw?.gallery || [];
  els.shots.innerHTML = '';
  els.thumbs.innerHTML = '';

  images.forEach((src, i) => {
    const shot = el('div', 'bb-shot');
    const img = el('img');
    img.src = src;
    img.alt = `${cw.name} view ${i + 1}`;
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    // The site runs Lenis smooth scroll + GSAP ScrollTrigger, both of which
    // cache the page height on load. This gallery is injected afterwards and
    // makes the page taller, so the scroll engine must re-measure or manual
    // scrolling gets capped at the old (shorter) height.
    img.addEventListener('load', recomputeScroll);
    shot.append(img);
    els.shots.append(shot);

    const thumb = el('button', 'bb-thumb');
    thumb.type = 'button';
    thumb.setAttribute('aria-label', `View image ${i + 1}`);
    thumb.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    const timg = el('img');
    timg.src = src;
    timg.alt = '';
    thumb.append(timg);
    thumb.addEventListener('click', () =>
      shot.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
    els.thumbs.append(thumb);
  });

  observeShots();
  recomputeScroll();
}

// Force the site's smooth-scroll engine (Lenis) and GSAP ScrollTrigger to
// re-measure the document height after the gallery grows the page. Lenis and
// ScrollTrigger both recompute on a window 'resize', so dispatching one is the
// reliable, dependency-free trigger; the direct calls are belt-and-suspenders
// in case either is exposed globally. Debounced through rAF so a burst of
// image 'load' events collapses into a single recompute.
let recomputeQueued = false;
function recomputeScroll() {
  if (recomputeQueued) return;
  recomputeQueued = true;
  requestAnimationFrame(() => {
    recomputeQueued = false;
    try { window.lenis?.resize?.(); } catch (e) {}
    try { window.ScrollTrigger?.refresh?.(); } catch (e) {}
    window.dispatchEvent(new Event('resize'));
  });
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
      syncBuyButton();
    }
  });
}

/* -------------------------------------------------------------------------
   Action buttons — one visible per tab
   ------------------------------------------------------------------------- */

function tabName(link) {
  const label = link.querySelector(SEL.tabLabel) || link;
  return (label.textContent || '').trim().toLowerCase();
}

function syncActionButtons(activeLink) {
  // Prefer the explicitly clicked tab, then Webflow's current tab, then the
  // first tab (Overview) — so the initial state is correct even before
  // Webflow finishes setting .w--current.
  const panel = document.querySelector(SEL.panel);
  const link =
    activeLink ||
    (panel && panel.querySelector(`${SEL.tabLink}.w--current`)) ||
    document.querySelector(`${SEL.tabLink}.w--current`) ||
    (panel && panel.querySelector(SEL.tabLink));
  const isCustomization = link ? tabName(link).includes('custom') : false;

  // Scope to the docked actions wrap so we never toggle a duplicate button
  // elsewhere on the page (mobile tabs, nav, etc.).
  const actions =
    (panel && panel.querySelector('.product-actions_wrap')) ||
    document.querySelector('.product-actions_wrap');
  const cart = actions ? actions.querySelector(SEL.addToCart)
                       : document.querySelector(SEL.addToCart);
  const project = actions ? actions.querySelector(SEL.projectLink)
                          : document.querySelector(SEL.projectLink);
  if (cart) cart.setAttribute('data-bb-hidden', String(isCustomization));
  if (project) project.setAttribute('data-bb-hidden', String(!isCustomization));
}

function watchTabs() {
  const panel = document.querySelector(SEL.panel);
  const menu = (panel && panel.querySelector(SEL.tabsMenu)) ||
               document.querySelector(SEL.tabsMenu);
  if (!menu) return;

  menu.querySelectorAll(SEL.tabLink).forEach((link) => {
    // Read the clicked tab directly — no dependence on .w--current timing.
    link.addEventListener('click', () => {
      syncActionButtons(link);
      requestAnimationFrame(() => syncActionButtons(link));
    });
    // Backup for programmatic tab changes.
    new MutationObserver(() => syncActionButtons()).observe(link, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  syncActionButtons();
  requestAnimationFrame(() => syncActionButtons());
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

export default function initPDP() {
  if (!document.querySelector(SEL.panel)) return; // not a PDP

  watchTabs();
  wireAddToCart();

  readData();

  buildBreadcrumb();
  buildTabHeaders();
  buildMaterials();
  buildSizeFit();

  if (els.anchor && state.colorways.length) {
    buildPanel();
    renderSwatches();
    buildGallery();
    syncSwatches();
    renderSizes();
    renderGallery();
    syncBuyButton();
  } else {
    console.warn('[PDP] no colorway data found — panel not built.');
  }

  // Reveal the product header now that the layout has been (re)built. An
  // anti-flicker rule in the site <head> keeps it hidden until this class is
  // present, so the stock Webflow layout never flashes before ours settles.
  // Set unconditionally so products without colorway JSON still reveal.
  document.documentElement.classList.add('bb-pdp-ready');

  BBCart.on('cartUpdate', () => {
    document.querySelectorAll('[data-bb-cart-count]').forEach((node) => {
      node.textContent = BBCart.itemCount();
    });
  });
}
