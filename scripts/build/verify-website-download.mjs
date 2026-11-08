import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { download as archiveName } from "../../website/render.mjs";
import { BRAND_FILES, brandSource } from "../../website/brand.mjs";

assert(process.argv[2], "Pass the website base URL as the first argument");
const base = new URL(process.argv[2]);
// --only=download or --only=legal keeps each run inside one guardian probe deadline.
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
assert([undefined, "download", "legal"].includes(only), "Use --only=download or --only=legal");
const archivePath = `/downloads/${archiveName}`;
const expectedZip = await readFile(new URL(`../../public${archivePath}`, import.meta.url));
const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const androidWebView = "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const text = {
  zh: {
    gatekeeper: "首次打开被拦截：系统设置 › 隐私与安全性 › 仍要打开",
    browser: "在浏览器中打开以下载",
    copy: "复制链接",
  },
  en: {
    gatekeeper: "Blocked on first open: System Settings › Privacy & Security › Open Anyway",
    browser: "Open in your browser to download",
    copy: "Copy link",
  },
};

const legalTitles = { zh: { privacy: "隐私政策", terms: "用户协议" }, en: { privacy: "Privacy Policy", terms: "Terms of Use" } };

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  if (only !== "legal") await verifyDownloads();
  if (only !== "download") for (const lang of ["zh", "en"]) for (const width of [1440, 390]) await verifyLegal(lang, width);
} finally {
  await browser.close();
}

async function verifyDownloads() {
  for (const lang of ["zh", "en"]) {
    await verifyPage(lang, 1440);
    await verifyPage(lang, 390, { userAgent: safari });
    await verifyPage(lang, 320, { userAgent: safari });
    await verifyPage(lang, 390, { userAgent: `${safari} MicroMessenger/8.0.58`, inApp: "WeChat" });
  }
  await verifyPage("zh", 390, { userAgent: `${safari} xhsdiscover/8.96`, inApp: "Xiaohongshu" });
  await verifyPage("en", 320, { userAgent: androidWebView, inApp: "Android WebView", clipboardUnavailable: true });
}

async function verifyPage(lang, width, { userAgent, inApp, clipboardUnavailable } = {}) {
  const phone = width < 700;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    userAgent,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    if (clipboardUnavailable) {
      await context.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
    }
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === archivePath) requests.push(request.url());
    });
    page.on("download", (download) => requests.push(download.url()));
    const response = await page.goto(new URL(`/${lang}/`, base).href, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator("html").getAttribute("lang"), lang === "zh" ? "zh-CN" : "en");
    const copy = page.getByRole("button", { name: text[lang].copy, exact: true });
    const download = page.locator(".download-mac");
    const hint = page.locator("#gatekeeper-hint");
    const prompt = page.locator("[data-open-in-browser]");
    if (inApp) {
      assert.equal(await prompt.innerText(), text[lang].browser);
      assert.equal(await download.isVisible(), false);
      assert.equal(await download.getAttribute("href"), null);
      assert.equal(await hint.isVisible(), false);
    } else {
      assert.equal(await prompt.isVisible(), false);
      assert.equal(await hint.innerText(), text[lang].gatekeeper);
      assert.equal(await download.evaluate((link) => new URL(link.href).pathname), archivePath);
      assert.equal(await download.getAttribute("download"), "");
      assert.equal(await copy.isVisible(), phone);
    }

    if (phone) {
      const copyBox = await copy.boundingBox();
      assert(copyBox && copyBox.height >= 44, "The copy target must be reachable on phones");
      if (!inApp) {
        const downloadBox = await download.boundingBox();
        assert(downloadBox && downloadBox.height >= 44 && copyBox.y < downloadBox.y, "Copy must precede download");
        await copy.press("Tab");
        await page.waitForFunction(() => document.activeElement.matches(".download-mac"), undefined, { timeout: 2000 });
      }
      await copy.click();
      const expectedUrl = new URL(`/${lang}/#download`, base).href;
      if (clipboardUnavailable) {
        const fallback = page.locator("[data-copy-fallback]");
        await fallback.waitFor({ state: "visible" });
        assert.equal(await fallback.inputValue(), expectedUrl);
        assert.equal(await fallback.evaluate((input) => input === document.activeElement), true);
      } else {
        await page.locator("[data-copy-success]").waitFor({ state: "visible" });
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedUrl);
      }
    }
    assert.deepEqual(requests, [], "Viewing the card and copying its link must not request the ZIP");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, "Horizontal overflow");
    assert.deepEqual(errors, []);
    if (lang === "zh" && !phone) {
      const home = await page.goto(base.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      assert.equal(home.status(), 200);
      await page.locator("[data-language-link]").click();
      assert.equal(new URL(page.url()).pathname, "/en/");
      assert.equal(await hint.innerText(), text.en.gatekeeper);
      assert.equal(await download.evaluate((link) => new URL(link.href).pathname), archivePath);
      const [archive] = await Promise.all([page.waitForEvent("download"), download.click()]);
      assert.equal(archive.suggestedFilename(), archiveName);
      assert.equal(await archive.failure(), null);
      assert((await readFile(await archive.path())).equals(expectedZip), "The downloaded ZIP must match the approved archive");
      await archive.delete();
      await verifyShareAssets(page);
    }
    console.log(`${lang} ${width}px ${inApp || "browser"} passed`);
  } finally {
    await context.close();
  }
}

async function verifyShareAssets(page) {
  const share = new URL(await page.locator('meta[property="og:image"]').getAttribute("content"));
  assert.equal(share.origin, "https://yozi.bot.cd");
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const manifestUrl = new URL(await page.locator('link[rel="manifest"]').getAttribute("href"), page.url());
  const response = await page.request.get(manifestUrl.href);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-type"], /^application\/manifest\+json\b/);
  const { icons } = await response.json();
  assert.deepEqual(icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  const images = [
    [share.pathname, "image/jpeg", 1200, 630],
    [touch, "image/png", 180, 180],
    ...icons.map(({ src, type, sizes }) => [new URL(src, manifestUrl).href, type, ...sizes.split("x").map(Number)]),
  ];
  for (const [src, type, width, height] of images) {
    const actual = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const image = await createImageBitmap(blob);
      return [response.status, blob.type, image.width, image.height];
    }, src);
    assert.deepEqual(actual, [200, type, width, height], src);
  }
  await verifyBrandSlots(page, ['link[rel="icon"]', ".brand-pill img", ".signup-brand img", ".footer-brand img"]);
  console.log(`Share image and three icons decoded at their declared sizes. ZIP matched all ${expectedZip.length} bytes.`);
}

// Each brand slot serves its official source (website/brand.mjs) byte for byte.
async function verifyBrandSlots(page, selectors) {
  for (const selector of selectors) {
    const url = new URL(await page.locator(selector).first().evaluate((node) => node.currentSrc || node.href));
    const published = url.pathname.slice(1);
    assert(BRAND_FILES[published], `${selector} points at ${url.pathname}, not a brand file`);
    const response = await page.request.get(url.href);
    assert.equal(response.status(), 200, url.href);
    assert((await response.body()).equals(await readFile(brandSource(published))), `${url.pathname} must match ${BRAND_FILES[published]}`);
  }
}

async function verifyLegal(lang, width) {
  const phone = width < 700;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const open = (path) => page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 45000 });
    for (const doc of ["privacy", "terms"]) {
      assert.equal((await open(`/${lang}/${doc}/`)).status(), 200);
      assert.equal(await page.locator("html").getAttribute("lang"), lang === "zh" ? "zh-CN" : "en");
      assert.equal(await page.locator("h1").textContent(), legalTitles[lang][doc]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, "Horizontal overflow");
      await verifyBrandSlots(page, ['link[rel="icon"]', ".legal-brand img"]);
      const footer = await page.locator(".legal-footer a").evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
      assert.deepEqual(footer, [`/${lang}/privacy/`, `/${lang}/terms/`]);
      // The homepage footer line reaches this document in the same language.
      await open(`/${lang}/`);
      const link = page.locator(`.footer-legal a[href="/${lang}/${doc}/"]`);
      assert.equal(await link.isVisible(), true);
      await Promise.all([page.waitForURL(`**/${lang}/${doc}/`), link.click()]);
      assert.equal(await page.locator("h1").textContent(), legalTitles[lang][doc]);
    }
    const other = lang === "zh" ? "en" : "zh";
    await Promise.all([page.waitForURL(`**/${other}/terms/`), page.locator("[data-language-link]").click()]);
    assert.equal(await page.evaluate(() => localStorage.getItem("yozi.website.language")), other);
    assert.deepEqual(errors, []);
    console.log(`${lang} ${width}px legal pages and footer links passed`);
  } finally {
    await context.close();
  }
}
