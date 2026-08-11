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

  const nav = el('p', 'bb-breadcrumb');
  if (bc.category) {
    const a = el('a', 'bb-breadcrumb-link', bc.category);
    a.href = bc.categoryUrl || '#';
    nav.append(a);
    nav.append(el('span', 'bb-breadcrumb-sep', ' • '));
  }
  nav.append(el('span', 'bb-breadcrumb-current', state.pdp.title || ''));

  // Top of the panel. On desktop the elements above the tabs are display:none,
  // so the breadcrumb stays visually where it was (just above the tabs); on
  // mobile — where Webflow hides the tabs and shows a native product block —
  // this lands it above the product title, as the prototype wants.
  panel.insertBefore(nav, panel.firstChild);
}

/* -------------------------------------------------------------------------
   Mobile / tablet product summary (≤991px)

   On mobile Webflow hides the desktop tab panel (.product-header_tabs, which
   holds .bb-panel-controls) and shows a native .is-mobile block instead. That
   block has no colour/size selector and carries a separate wholesale-pricing
   panel (.details-price-mobile). This mirrors the desktop panel onto the
   native block: the sample price beside the title, plus hex-circle colour
   swatches and the size grid — all driven by the SAME state as the desktop
   controls (renderSwatches/renderSizes fill both container sets). Desktop is
   untouched: everything here is hidden at ≥992px via CSS.
   ------------------------------------------------------------------------- */

function buildMobileControls() {
  const panel = document.querySelector(SEL.panel);
  if (!panel) return;

  // Sample price on the same line as the native mobile title (matches desktop).
  const title = panel.querySelector('.h1-product.is-mobile');
  if (title && title.parentElement && state.pdp.samplePrice) {
    const wrap = title.parentElement;
    wrap.classList.add('bb-m-title-row');
    if (!wrap.querySelector('.bb-m-price')) {
      const price = el('span', 'bb-m-price', state.pdp.samplePrice);
      // Match the native title's size/weight so the pair reads as one line.
      const cs = getComputedStyle(title);
      price.style.fontSize = cs.fontSize;
      price.style.fontWeight = cs.fontWeight;
      wrap.append(price);
    }
  }

  // Colour circles + size grid, rendered by the shared render fns.
  const controls = el('div', 'bb-m-controls');
  controls.append(el('h2', 'bb-panel-heading', 'Color'));
  els.mSwatches = el('div', 'bb-swatches bb-m-swatches');
  controls.append(els.mSwatches);
  controls.append(el('h2', 'bb-panel-heading', 'Size'));
  els.mSizes = el('div', 'bb-sizes bb-m-sizes');
  controls.append(els.mSizes);

  // End of the native mobile block, just before the (mobile-hidden) tab panel.
  const tabs = panel.querySelector('.product-header_tabs');
  if (tabs) panel.insertBefore(controls, tabs);
  else panel.append(controls);
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
   Mobile tab order

   The page carries a second, mobile-only tab bar (.product-header_tabs
   .is-mobile, in the header section) whose links are authored in a different
   order than the desktop bar: Overview, Materials, Customization, Size & Fit.
   Reorder its menu links to match desktop (Overview, Customization, Materials,
   Size & Fit). Webflow links each menu link to its pane by data-w-tab name, so
   moving the links only changes their visual/focus order — the tabs keep
   working. Desktop's bar is a separate element and is left untouched.
   ------------------------------------------------------------------------- */

function orderMobileTabs() {
  const menu = document.querySelector(
    '.product-header_tabs.is-mobile .product-header_tabs-menu'
  );
  if (!menu) return;
  const rank = (link) => {
    const t = (link.textContent || '').trim().toLowerCase();
    if (t.includes('overview')) return 0;
    if (t.includes('custom')) return 1;
    if (t.includes('material')) return 2;
    if (t.includes('size') || t.includes('fit')) return 3;
    return 4;
  };
  [...menu.querySelectorAll('.product-header_tab-link')]
    .sort((a, b) => rank(a) - rank(b))
    .forEach((link) => menu.append(link));
}

/* -------------------------------------------------------------------------
   Mobile tab alignment

   The mobile tab bar sits in the header section, a different container from
   the size grid / Add to Cart, so its left edge doesn't line up with the page
   content padding — the first tab (Overview + its gold dot) hangs to the left.
   Pad the menu so the first tab starts exactly at the size selector's left
   edge. Measured (not hardcoded) because the two containers' paddings differ,
   and re-run on resize. Skipped when the bar is hidden (desktop).
   ------------------------------------------------------------------------- */

let mobileTabsBasePad = null;

function alignMobileTabs() {
  const menu = document.querySelector(
    '.product-header_tabs.is-mobile .product-header_tabs-menu'
  );
  const firstLink = menu && menu.querySelector('.product-header_tab-link');
  const ref =
    els.mSizes ||
    document.querySelector('.bb-m-sizes') ||
    document.querySelector('.add-to-cart_button');
  if (!menu || !firstLink || !ref) return;
  if (!menu.offsetParent) return; // hidden (desktop) — leave it alone

  if (mobileTabsBasePad === null) {
    mobileTabsBasePad = parseFloat(getComputedStyle(menu).paddingLeft) || 0;
  }
  // Reset to the CSS base before measuring so repeated runs don't compound.
  menu.style.paddingLeft = `${mobileTabsBasePad}px`;
  const target = ref.getBoundingClientRect().left;
  const current = firstLink.getBoundingClientRect().left;
  const pad = Math.max(0, mobileTabsBasePad + (target - current));
  menu.style.paddingLeft = `${pad}px`;
}

function scheduleMobileTabAlign() {
  requestAnimationFrame(alignMobileTabs);
  [200, 600, 1200].forEach((t) => setTimeout(alignMobileTabs, t));
  window.addEventListener('load', alignMobileTabs, { once: true });
  window.addEventListener('resize', () =>
    requestAnimationFrame(alignMobileTabs)
  );
}

/* -------------------------------------------------------------------------
   Mobile: relocate the floating "Start New Project" CTA into the nav menu

   On mobile the product's "Start New Project" button (.button-navigation
   .is-ecommerce, sitting in a fixed .product_button-wrap) floats over the
   page. Move it to the bottom of the nav dropdown — inside the rounded
   .navbar_left panel, after the secondary links in .menu_in — and square its
   corners to the panel (16px, via the .bb-menu-cta class in pdp.css). Gated to
   ≤991px and restored to its original spot on desktop, so desktop is left
   untouched.
   ------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
   "Explore Key Features" section — relabel its header to the product SKU and
   drop the divider line beneath it. One responsive component
   (.feature_component-responsive); the "divider" is the 1px bottom border on
   the header wrapper (.description-feature-top).
   ------------------------------------------------------------------------- */

function relabelFeatureSection() {
  document
    .querySelectorAll('.feature_component-responsive, .feature_component')
    .forEach((sec) => {
      if (state.pdp.sku) {
        const head = sec.querySelector('.h2-description');
        if (head) head.textContent = state.pdp.sku;
      }
      const top = sec.querySelector('.description-feature-top');
      if (top) top.style.borderBottom = '0';
    });
}

function relocateProjectCTA() {
  const btn = document.querySelector('.button-navigation.is-ecommerce');
  const menu = document.querySelector('.navbar_eccommerce .menu_in');
  if (!btn || !menu) return;

  const mobile = window.matchMedia('(max-width: 991px)').matches;
  if (mobile) {
    if (btn.parentElement !== menu) {
      if (!btn.__bbHome) {
        btn.__bbHome = { parent: btn.parentElement, next: btn.nextSibling };
      }
      btn.classList.add('bb-menu-cta');
      menu.append(btn); // bottom of the menu
    }
  } else if (btn.__bbHome && btn.parentElement === menu) {
    btn.classList.remove('bb-menu-cta');
    btn.__bbHome.parent.insertBefore(btn, btn.__bbHome.next);
  }
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

// Builds the Materials content (Composition + specs + Traceability) as a fresh
// element from CMS data, so both the desktop and mobile panes can use it.
function materialsContent() {
  const mat = state.pdp.materials;
  const trace = state.pdp.traceability;
  const hasComposition = mat && Array.isArray(mat.composition) && mat.composition.length;
  const hasTrace = Array.isArray(trace) && trace.length;
  if (!mat && !hasTrace) return null;

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

  return wrap;
}

function buildMaterials() {
  const pane = findMaterialsPane();
  if (!pane) return;
  const content = materialsContent();
  if (!content) return; // no CMS data — leave the original tab as-is

  // Replace the original Webflow materials/details content with ours.
  [...pane.children].forEach((child) => {
    if (!child.classList.contains('bb-tab-header') && !child.classList.contains('bb-materials')) {
      child.style.display = 'none';
    }
  });

  pane.append(content);
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

  const hasTable = (el) => !!el.querySelector('.fit-table-wrap, .fit-table, table');
  if (!hasTable(pane)) return; // no measurements table — leave the tab untouched

  // The Fit Guide and the Measurements table are interleaved (and duplicated
  // across desktop/mobile blocks). Hide only Fit Guide blocks that don't hold
  // the table; recurse into wrappers that contain both so the table survives.
  const stripFitGuide = (container) => {
    [...container.children].forEach((child) => {
      if (child.classList.contains('bb-tab-header')) return;
      const mentionsFitGuide = /fit guide/i.test(child.textContent || '');
      const childHasTable = hasTable(child);
      if (mentionsFitGuide && !childHasTable) {
        child.style.display = 'none'; // a pure Fit Guide block
      } else if (mentionsFitGuide && childHasTable) {
        stripFitGuide(child); // wrapper holding both — go one level deeper
      }
      // a block with the table and no Fit Guide is kept as-is
    });
  };
  stripFitGuide(pane);

  // Match the other section headers: bump the Measurements heading to 14px.
  [...pane.querySelectorAll('.text-weight-medium')].forEach((h) => {
    if (/^measurements$/i.test((h.textContent || '').trim())) h.style.fontSize = '14px';
  });
}

/* -------------------------------------------------------------------------
   Customization tab — intro, "How to Get Started" steps, "Mockup Templates"
   download/copy links (Figma / Photoshop / Illustrator) and minimums. Rendered
   from CMS (pdp-json.customization); the original Webflow content is hidden.
   ------------------------------------------------------------------------- */

// Inline brand marks so the template links need no external assets (CSP-safe).
const TPL_ICONS = {
  figma:
    '<svg viewBox="0 0 38 57" aria-hidden="true">' +
    '<path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>' +
    '<path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/>' +
    '<path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/>' +
    '<path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>' +
    '<path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/>' +
    '</svg>',
  photoshop:
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect width="24" height="24" rx="4" fill="#001E36"/>' +
    '<text x="12" y="16.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11" fill="#31A8FF">Ps</text>' +
    '</svg>',
  illustrator:
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect width="24" height="24" rx="4" fill="#330000"/>' +
    '<text x="12" y="16.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11" fill="#FF9A00">Ai</text>' +
    '</svg>',
};

function findCustomizationPane() {
  const panel = document.querySelector(SEL.panel);
  if (!panel) return null;
  const panes = [...panel.querySelectorAll('.product-header_tab-details')];
  const links = [...panel.querySelectorAll(SEL.tabLink)];
  const idx = links.findIndex((l) => /custom/i.test(l.textContent || ''));
  if (idx >= 0 && panes[idx]) return panes[idx];
  return panes[1] || null; // tab order: Overview, Customization, Materials, Size & Fit
}

function buildCustomization() {
  const c = state.pdp.customization;
  if (!c) return;
  const pane = findCustomizationPane();
  if (!pane) return;

  // Keep the original Webflow gallery slider (left/right scroll + floating tag +
  // Webflow's own init) and hide only the old copy around it. A slider-bearing
  // wrapper is kept, with just its non-slider sub-blocks (the text) hidden; any
  // wrapper without a slider is hidden outright. Our copy is appended after, so
  // the slider ends up above all text but below the product-title header.
  const sliderSel = '.w-slider, .swiper, [class*="slider"], [class*="gallery"]';
  const hasSlider = (n) => n.matches(sliderSel) || !!n.querySelector(sliderSel);
  [...pane.children].forEach((child) => {
    if (child.classList.contains('bb-tab-header') || child.classList.contains('bb-custom')) return;
    if (!hasSlider(child)) {
      child.style.display = 'none';
      return;
    }
    [...child.children].forEach((sub) => {
      if (!hasSlider(sub)) sub.style.display = 'none';
    });
  });

  // Intro copy sits ABOVE the gallery — between the product title and slider.
  pane.querySelectorAll('.bb-custom-intro').forEach((n) => n.remove());
  if (c.intro) {
    const intro = el('p', 'bb-desc bb-custom-intro', c.intro);
    const header = pane.querySelector('.bb-tab-header');
    if (header) header.insertAdjacentElement('afterend', intro);
    else pane.insertBefore(intro, pane.firstChild);
  }

  pane.append(customContent());
}

// Builds the Customization text content (How to Get Started + Mockup Templates
// + Minimums) as a fresh element, shared by the desktop and mobile panes. The
// intro copy and the image slider are handled separately by each caller.
function customContent() {
  const c = state.pdp.customization || {};
  const wrap = el('div', 'bb-custom');

  if (Array.isArray(c.steps) && c.steps.length) {
    wrap.append(el('h2', 'bb-panel-heading', 'How to Get Started'));
    const ol = el('ol', 'bb-steps');
    c.steps.forEach((s) => ol.append(el('li', null, s)));
    wrap.append(ol);
  }

  if (Array.isArray(c.templates) && c.templates.length) {
    wrap.append(el('h2', 'bb-panel-heading', 'Mockup Templates'));
    const list = el('div', 'bb-templates');
    c.templates.forEach((t) => {
      const a = el('a', 'bb-tpl');
      a.href = t.url || '#';
      if (t.url && t.url !== '#') {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      const icon = el('span', 'bb-tpl-icon');
      icon.innerHTML = TPL_ICONS[t.type] || '';
      a.append(icon, el('span', 'bb-tpl-label', t.label || t.type || ''));
      list.append(a);
    });
    wrap.append(list);
  }

  if (c.minimums) {
    wrap.append(el('h2', 'bb-panel-heading', 'Minimums'));
    wrap.append(el('p', 'bb-desc', c.minimums));
  }

  return wrap;
}

/* -------------------------------------------------------------------------
   Mobile tab content

   The page carries a second, mobile-only tab set (.product-header_tabs
   .is-mobile) whose panes hold placeholder Webflow content (lorem, "No items
   found"), divider lines and duplicated accordions. Replace each pane's
   content with the same CMS-driven content the desktop tabs show, laid out
   for mobile:
     - Overview      → Product Details only (title/price/desc/colour/size are
                       already shown above the tabs on mobile)
     - Materials     → Composition + specs + Traceability
     - Customization → intro + the native example slider (reused in place) +
                       How to Get Started / Mockup Templates / Minimums
     - Sizing & Fit  → the native Measurements table (reused in place)
   The native slider and fit-table are real Webflow elements, so they're moved
   (not cloned) to keep Webflow's own slider behaviour. Desktop's separate tab
   set is untouched (these panes are display:none at ≥992px).
   ------------------------------------------------------------------------- */

function mobilePane(kind) {
  const root = document.querySelector('.product-header_tabs.is-mobile');
  if (!root) return null;
  const menu = root.querySelector('.product-header_tabs-menu');
  const content = root.querySelector('.product-header_tabs-content');
  if (!menu || !content) return null;
  const test = {
    overview: (t) => t.includes('overview'),
    customization: (t) => t.includes('custom'),
    materials: (t) => t.includes('material'),
    sizefit: (t) => t.includes('size') || t.includes('fit'),
  }[kind];
  const link = [...menu.querySelectorAll('.product-header_tab-link')].find((l) =>
    test((l.textContent || '').trim().toLowerCase())
  );
  if (!link) return null;
  const tab = link.getAttribute('data-w-tab');
  return content.querySelector(
    `.product-header_tab-details[data-w-tab="${tab}"]`
  );
}

// Hide every current child of a pane (the native placeholder content) so our
// ported content is all that shows. Anything we want to keep is moved out
// first, before this runs.
function clearPaneContent(pane) {
  [...pane.children].forEach((child) => {
    child.style.display = 'none';
  });
}

function buildMobileTabContent() {
  if (!document.querySelector('.product-header_tabs.is-mobile')) return;
  const pdp = state.pdp;

  // Overview → Product Details only.
  const ov = mobilePane('overview');
  if (ov && Array.isArray(pdp.productDetails) && pdp.productDetails.length) {
    clearPaneContent(ov);
    const wrap = el('div', 'bb-mtab');
    wrap.append(el('h2', 'bb-panel-heading', 'Product Details'));
    const ul = el('ul', 'bb-bullets');
    pdp.productDetails.forEach((b) => ul.append(el('li', null, b)));
    wrap.append(ul);
    ov.append(wrap);
  }

  // Materials → Composition + specs + Traceability.
  const mt = mobilePane('materials');
  if (mt) {
    const content = materialsContent();
    if (content) {
      clearPaneContent(mt);
      const wrap = el('div', 'bb-mtab');
      wrap.append(content);
      mt.append(wrap);
    }
  }

  // Customization → intro + native slider (reused) + steps/templates/minimums.
  const cu = mobilePane('customization');
  if (cu && pdp.customization) {
    const slider = cu.querySelector('.w-slider');
    const wrap = el('div', 'bb-mtab bb-custom-mtab');
    if (pdp.customization.intro) {
      wrap.append(el('p', 'bb-desc bb-custom-intro', pdp.customization.intro));
    }
    if (slider) {
      slider.style.display = ''; // in case a hidden ancestor set it
      wrap.append(slider); // moves the live Webflow slider into our layout
    }
    wrap.append(customContent());
    clearPaneContent(cu); // hide leftover native content (slider already moved)
    cu.append(wrap);
  }

  // Sizing & Fit → the native Measurements table (reused).
  const sf = mobilePane('sizefit');
  if (sf) {
    const table =
      sf.querySelector('.embed-table.w-embed') ||
      sf.querySelector('.fit-table-wrap') ||
      sf.querySelector('.fit-table');
    const wrap = el('div', 'bb-mtab');
    wrap.append(el('h2', 'bb-panel-heading', 'Measurements'));
    if (table) {
      table.style.display = '';
      wrap.append(table);
    }
    clearPaneContent(sf);
    sf.append(wrap);
  }

  // Webflow sliders size their slides on load/resize; the move above happens
  // after that, so nudge a recompute once the pane is laid out.
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
}

/* -------------------------------------------------------------------------
   Swatches (image thumbnails) + size grid
   ------------------------------------------------------------------------- */

// The desktop panel and the mobile summary each have their own swatch/size
// containers; both render from — and drive — the same state.
function swatchWraps() {
  return [els.swatches, els.mSwatches].filter(Boolean);
}
function sizeWraps() {
  return [els.sizes, els.mSizes].filter(Boolean);
}

function renderSwatches() {
  swatchWraps().forEach((wrap) => {
    wrap.innerHTML = '';
    state.colorways.forEach((cw, i) => {
      const chip = el('button', 'bb-swatch');
      chip.type = 'button';
      chip.setAttribute('aria-label', cw.name);
      chip.setAttribute('aria-pressed', String(i === state.activeColor));
      // Hex from the CMS drives the mobile circle (CSS reads --bb-swatch).
      if (cw.swatch) chip.style.setProperty('--bb-swatch', cw.swatch);
      const img = el('img');
      img.src = cw.gallery[0] || '';
      img.alt = '';
      img.loading = 'lazy';
      chip.append(img);
      chip.addEventListener('click', () => selectColorway(i));
      wrap.append(chip);
    });
  });
}

function syncSwatches() {
  swatchWraps().forEach((wrap) => {
    [...wrap.children].forEach((chip, i) => {
      chip.setAttribute('aria-pressed', String(i === state.activeColor));
    });
  });
  if (els.colorNote) {
    els.colorNote.textContent = state.colorways[state.activeColor]?.name || '';
  }
}

function renderSizes() {
  const cw = state.colorways[state.activeColor];
  sizeWraps().forEach((grid) => {
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
  });
}

/* -------------------------------------------------------------------------
   Gallery — JS-owned vertical stack + thumbnail rail, swaps per colorway
   ------------------------------------------------------------------------- */

function buildGallery() {
  const column = document.querySelector(SEL.galleryColumn);
  if (!column) return;
  els.galleryColumn = column;
  column.classList.add('bb-js-gallery');

  els.rail = el('div', 'bb-thumb-rail');
  els.thumbs = el('div', 'bb-thumbs');
  els.rail.append(els.thumbs);

  els.shots = el('div', 'bb-shots');
  els.dots = el('div', 'bb-dots');
  column.insertBefore(els.rail, column.firstChild);
  column.append(els.shots);
  column.append(els.dots);

  // On mobile/tablet .bb-shots becomes a horizontal, edge-to-edge scroll-snap
  // carousel (see pdp.css). Keep the dot pagination in sync with the swipe.
  els.shots.addEventListener('scroll', () => {
    if (dotSyncQueued) return;
    dotSyncQueued = true;
    requestAnimationFrame(() => {
      dotSyncQueued = false;
      syncDots();
    });
  }, { passive: true });

  // The gallery grows the page after Lenis/ScrollTrigger have cached the
  // document height, so nudge them to re-measure a few times as late assets
  // (fonts, lazy images) settle. window 'load' may already have fired by the
  // time this module runs, so schedule the nudges unconditionally.
  [200, 600, 1200].forEach((t) => setTimeout(recomputeScroll, t));
  window.addEventListener('load', recomputeScroll, { once: true });

  // The thumbnails are absolutely positioned and hang below the (zero-height)
  // sticky rail, so keep the rail's height in sync with them — otherwise the
  // sticky pin releases only at the column bottom and the thumbs overhang past
  // the gallery into the next section. Also recompute the mobile full-bleed.
  window.addEventListener('resize', () =>
    requestAnimationFrame(() => {
      sizeThumbRail();
      fullBleedGallery();
    })
  );
  window.addEventListener('load', () => {
    sizeThumbRail();
    fullBleedGallery();
  }, { once: true });
}

// On mobile/tablet the shots + dots are pulled out to the full viewport width.
// The parent isn't centered in the viewport, so a pure-CSS calc mis-aligns it —
// measure the natural left offset and negate it. Cleared on desktop.
function fullBleedGallery() {
  const col = els.galleryColumn;
  if (!col || !els.shots) return;

  if (window.innerWidth > 991) {
    col.style.position = '';
    els.shots.style.width = '';
    els.shots.style.marginLeft = '';
    if (els.dots) {
      els.dots.style.width = '';
      els.dots.style.left = '';
    }
    return;
  }

  col.style.position = 'relative';
  els.shots.style.width = '100vw';
  els.shots.style.marginLeft = '0px';
  const left = Math.round(els.shots.getBoundingClientRect().left);
  els.shots.style.marginLeft = `${-left}px`;
  if (els.dots) {
    els.dots.style.width = '100vw';
    els.dots.style.left = `${-left}px`;
  }
}

// Give the sticky rail a real height equal to the thumbnails so its sticky pin
// releases exactly when the thumbnails' bottom meets the gallery bottom. The
// compensating negative margin must go on the SHOTS, not the rail — sticky
// counts the element's own margins in its constraint box, so a negative margin
// on the rail would cancel the height gain and it would release too late.
function sizeThumbRail() {
  if (!els.rail || !els.thumbs || !els.shots) return;
  const h = els.thumbs.offsetHeight;
  if (!h) return;
  els.rail.style.height = `${h}px`;
  els.rail.style.marginBottom = ''; // clear the earlier (ineffective) approach
  els.shots.style.marginTop = `${-h}px`; // pull the shots back up to close the gap
}

function renderGallery() {
  if (!els.shots) return;
  const cw = state.colorways[state.activeColor];
  const images = cw?.gallery || [];
  els.shots.innerHTML = '';
  els.thumbs.innerHTML = '';
  els.dots.innerHTML = '';

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

    // Mobile pagination dot for this shot.
    const dot = el('button', 'bb-dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Go to image ${i + 1}`);
    dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () =>
      shot.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    );
    els.dots.append(dot);
  });

  observeShots();
  recomputeScroll();
  requestAnimationFrame(() => {
    sizeThumbRail();
    fullBleedGallery();
  });
}

// Highlight the dot for the shot currently centered in the horizontal carousel.
let dotSyncQueued = false;
function syncDots() {
  if (!els.shots || !els.dots || !els.dots.children.length) return;
  const w = els.shots.clientWidth || 1;
  const idx = Math.max(0, Math.round(els.shots.scrollLeft / w));
  [...els.dots.children].forEach((d, i) =>
    d.setAttribute('aria-current', i === idx ? 'true' : 'false')
  );
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
  orderMobileTabs();
  buildCustomization();
  buildMaterials();
  buildSizeFit();
  buildMobileTabContent();
  relabelFeatureSection();
  relocateProjectCTA();
  window.addEventListener('resize', relocateProjectCTA);

  if (els.anchor && state.colorways.length) {
    buildPanel();
    buildMobileControls();
    renderSwatches();
    buildGallery();
    syncSwatches();
    renderSizes();
    renderGallery();
    syncBuyButton();
  } else {
    console.warn('[PDP] no colorway data found — panel not built.');
  }

  // Align the mobile tab bar's first tab to the content padding (needs the
  // size grid / cart in place, so run after the panel is built).
  scheduleMobileTabAlign();

  BBCart.on('cartUpdate', () => {
    document.querySelectorAll('[data-bb-cart-count]').forEach((node) => {
      node.textContent = BBCart.itemCount();
    });
  });
}
