// UX research on a real store: slow, read-only, one page of each type, no cart and no form submission.
// Usage: node capture.mjs check | capture <outlineDir> | details
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.RESEARCH_BASE_URL;
if (!BASE) throw new Error('Set RESEARCH_BASE_URL to the reference store origin');
const CATEGORY = `${BASE}${process.env.RESEARCH_CATEGORY_PATH ?? '/'}`;
const SCREENS = join(dirname(fileURLToPath(import.meta.url)), '../../docs/research/screens');
const PAUSE_MS = 5000;
const SLICE_HEIGHT = { desktop: 1500, mobile: 1700 };
const MAX_SLICES = 8;

// Paths the store's robots.txt disallows. Never navigate to them.
const DISALLOWED = /^\/(br\/)?(admin|account|checkout|discount|comprar|comprar-express|completar-compra-express|search|frete|fb-comment)(\/|$)/;

export function isBlocked(url, method, resourceType) {
  const u = new URL(url);
  if (u.origin !== BASE) return false;
  if (method !== 'GET') return true; // Nothing is ever submitted to the store.
  return resourceType === 'document' && DISALLOWED.test(u.pathname);
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

async function open(page, url) {
  await page.waitForTimeout(PAUSE_MS);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 400));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

async function vitals(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          const res = performance.getEntriesByType('resource');
          const nav = performance.getEntriesByType('navigation')[0];
          resolve({
            lcpMs: Math.round(lcp),
            cls: Number(cls.toFixed(3)),
            ttfbMs: Math.round(nav.responseStart),
            requests: res.length,
            hosts: new Set(res.map((r) => new URL(r.name).host)).size,
            transferKB: Math.round((res.reduce((s, r) => s + r.transferSize, 0) + nav.transferSize) / 1024),
          });
        }, 1500);
      }),
  );
}

// UI labels only. Anything inside a product card is skipped, so no catalog data is collected.
const outline = (page) =>
  page.evaluate(() => {
    const seen = new Set();
    const items = [];
    for (const el of document.querySelectorAll('h1,h2,h3,button,a.btn,label,select,input,summary,[class*="installment"],[class*="discount"],[class*="free-shipping"],[class*="shipping"]')) {
      if (el.closest('.js-item-product') || el.closest('script,style')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const text = (el.innerText || el.placeholder || el.getAttribute('aria-label') || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const line = `${el.tagName.toLowerCase()}: ${text}`;
      if (text && !seen.has(line)) { seen.add(line); items.push(line); }
    }
    return items;
  });

async function shot(page, name, label) {
  await page.screenshot({ path: join(SCREENS, `${name}-${label}.png`) });
}

async function slices(page, name, label) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const { width } = page.viewportSize();
  const step = SLICE_HEIGHT[name];
  const count = Math.min(Math.ceil(height / step), MAX_SLICES);
  for (let i = 0; i < count; i++) {
    await page.screenshot({
      path: join(SCREENS, `${name}-${label}-${String(i + 1).padStart(2, '0')}.png`),
      fullPage: true,
      clip: { x: 0, y: i * step, width, height: Math.min(step, height - i * step) },
    });
  }
  return { height, count };
}

// Clicks stay on the page: they open menus and modals or pick a variant. A missing control is a finding, not an error.
async function tryClick(page, selector) {
  const target = page.locator(selector).locator('visible=true').first();
  if (!(await target.count())) return false;
  await target.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

async function closeModal(page) {
  await page.keyboard.press('Escape');
  await tryClick(page, '.js-modal-close:visible');
  await page.waitForTimeout(600);
}

async function run(name, outlineDir) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ...VIEWPORTS[name], locale: 'pt-BR' });
  const blocked = [];
  await context.route('**/*', (route) => {
    const req = route.request();
    if (!isBlocked(req.url(), req.method(), req.resourceType())) return route.continue();
    blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort();
  });
  const page = await context.newPage();
  const report = { viewport: name, pages: {}, found: {} };
  const dump = (key, lines) => writeFileSync(join(outlineDir, `${name}-${key}.txt`), lines.join('\n'));

  try {
    // Home
    await open(page, BASE);
    report.pages.home = await vitals(page);
    await shot(page, name, 'home-topo');
    await tryClick(page, '.js-acknowledge-cookies');
    if (name === 'desktop') {
      await page.getByText('Produtos', { exact: false }).first().hover().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, name, 'home-menu');
      await page.mouse.move(700, 700);
    } else {
      report.found.hamburger = await tryClick(page, '[data-toggle="#nav-hamburger"]');
      await shot(page, name, 'home-menu');
      await closeModal(page);
    }
    report.found.cartOpened = await tryClick(page, '[data-toggle="#modal-cart"]');
    await shot(page, name, 'carrinho-vazio');
    dump('carrinho-vazio', await outline(page));
    await closeModal(page);
    await scrollThrough(page);
    report.pages.homeSlices = await slices(page, name, 'home');
    dump('home', await outline(page));

    // Category
    await open(page, CATEGORY);
    report.pages.category = await vitals(page);
    await shot(page, name, 'categoria-topo');
    const productUrl = await page.locator('.js-item-product a[href*="/produtos/"]').first().getAttribute('href');
    report.found.filters = await tryClick(page, '[data-toggle="#nav-filters"], .js-filter-button, a:has-text("Filtrar"), button:has-text("Filtrar")');
    await shot(page, name, 'categoria-filtros');
    await closeModal(page);
    await scrollThrough(page);
    report.pages.categorySlices = await slices(page, name, 'categoria');
    dump('categoria', await outline(page));
    report.found.sort = await page.locator('select.js-sort-by, select[name*="sort"]').count();
    report.found.pagination = await page.locator('.pagination, .js-load-more, [class*="pagination"]').count();

    // Product
    await open(page, new URL(productUrl, BASE).href);
    report.pages.product = await vitals(page);
    await shot(page, name, 'produto-topo');
    await scrollThrough(page);
    report.pages.productSlices = await slices(page, name, 'produto');
    dump('produto', await outline(page));
    report.found.sizeGuide = await tryClick(page, 'a:has-text("Guia de"), a:has-text("Tabela de"), a:has-text("medidas"), button:has-text("medidas")');
    await shot(page, name, 'produto-medidas');
    await closeModal(page);
    report.found.variantButtons = await page.locator('.js-insta-variant, [data-option], .js-variation-option').count();
    await tryClick(page, '.js-insta-variant:not(.selected), [data-option]:not(.selected)');
    await shot(page, name, 'produto-variacao');
    report.found.shippingInput = await page.locator('.js-shipping-input, input[name="zipcode"]').count();
  } finally {
    await browser.close();
  }
  report.blocked = [...new Set(blocked)];
  return report;
}

// Opens on-page accordions and the quick-shop modal. Never presses a buy button inside them.
async function details() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ...VIEWPORTS.mobile, locale: 'pt-BR' });
  await context.route('**/*', (route) => {
    const req = route.request();
    return isBlocked(req.url(), req.method(), req.resourceType()) ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  try {
    await open(page, CATEGORY);
    await tryClick(page, '.js-acknowledge-cookies');
    const productUrl = await page.locator('.js-item-product a[href*="/produtos/"]').first().getAttribute('href');
    await tryClick(page, '.js-item-product [data-toggle="#quickshop-modal"]');
    await page.waitForTimeout(1500);
    await shot(page, 'mobile', 'categoria-compra-rapida');

    await open(page, new URL(productUrl, BASE).href);
    await tryClick(page, 'text=/MEIOS DE PAGAMENTO/i');
    await shot(page, 'mobile', 'produto-pagamento');
    await tryClick(page, 'text=/MEIOS DE PAGAMENTO/i');
    await tryClick(page, 'text=/MEIOS DE ENVIO/i');
    await shot(page, 'mobile', 'produto-envio');
  } finally {
    await browser.close();
  }
}

function check() {
  assert.equal(isBlocked(`${BASE}/comprar/`, 'GET', 'document'), true);
  assert.equal(isBlocked(`${BASE}/checkout/v3/start`, 'GET', 'document'), true);
  assert.equal(isBlocked(`${BASE}/produtos/x/`, 'POST', 'xhr'), true);
  assert.equal(isBlocked(`${BASE}/produtos/x/`, 'GET', 'document'), false);
  assert.equal(isBlocked('https://cdn.example.com/a.js', 'POST', 'xhr'), false);
  console.log('ok');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, outlineDir] = process.argv.slice(2);
  if (mode === 'check') check();
  else if (mode === 'details') await details();
  else if (mode === 'capture' && outlineDir) {
    mkdirSync(SCREENS, { recursive: true });
    mkdirSync(outlineDir, { recursive: true });
    const reports = [await run('desktop', outlineDir), await run('mobile', outlineDir)];
    writeFileSync(join(outlineDir, 'report.json'), JSON.stringify(reports, null, 1));
    console.log(JSON.stringify(reports, null, 1));
  } else console.error('usage: node capture.mjs check | capture <outlineDir>');
}
