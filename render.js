/**
 * robust-render.js
 *
 * Most robust single-file Puppeteer renderer for CI (GitHub Actions etc).
 * - auto-falls back between `puppeteer` and `puppeteer-core`
 * - supports custom executable path via env (PUPPETEER_EXECUTABLE_PATH or CHROME_PATH)
 * - retries navigation with exponential backoff
 * - safer default wait strategy: domcontentloaded + waitForSelector or networkidle2 fallback
 * - optional blocking of images/fonts/trackers to avoid long-running connections
 * - creates debug artifacts (screenshot + error-html) on failure
 *
 * Usage:
 *  node robust-render.js
 *  override via env:
 *    URL, OUTPUT, NAV_TIMEOUT_MS, RETRIES, SELECTOR, BLOCK_IMAGES (true/false),
 *    PUPPETEER_EXECUTABLE_PATH, HEADLESS (true/false)
 */

const fs = require("fs");
const path = require("path");

const NAV_TIMEOUT_MS = parseInt(process.env.NAV_TIMEOUT_MS || "90000", 10); // 90s
const RETRIES = parseInt(process.env.RETRIES || "3", 10); // total attempts
const WAIT_FOR_SELECTOR_MS = parseInt(process.env.WAIT_FOR_SELECTOR_MS || "30000", 10);
const URL = process.env.URL || "https://www.prothomalo.com/opinion";
const OUTPUT = process.env.OUTPUT || path.resolve(__dirname, "opinion.html");
const SELECTOR = process.env.SELECTOR || 'article, [role="main"], .opinion-list, .article, .container';
const BLOCK_IMAGES = (process.env.BLOCK_IMAGES || "true").toLowerCase() === "true";
const HEADLESS = (process.env.HEADLESS || "true").toLowerCase() === "true";
const EXEC_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || null;

let puppeteer;
try {
  // prefer full puppeteer (bundles chromium) if installed
  puppeteer = require("puppeteer");
} catch (e) {
  // fallback to puppeteer-core; ensure EXEC_PATH is set in CI
  puppeteer = require("puppeteer-core");
}

(async function main() {
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-gpu",
    "--window-size=1280,1024",
  ];

  const launchOptions = {
    headless: HEADLESS,
    args: launchArgs,
    ignoreHTTPSErrors: true,
  };

  if (EXEC_PATH) {
    launchOptions.executablePath = EXEC_PATH;
  }

  // reduce default timeouts globally
  const DEFAULT_TIMEOUT = Math.max(NAV_TIMEOUT_MS, WAIT_FOR_SELECTOR_MS) + 10000;

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (err) {
    console.error("Failed to launch browser:", err && err.message ? err.message : err);
    process.exit(2);
  }

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS + 20000);
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  // basic page logging for debugging in CI logs
  page.on("console", msg => {
    try { console.log("PAGE LOG:", msg.text()); } catch (e) {}
  });
  page.on("pageerror", err => console.log("PAGE ERROR:", err && err.message ? err.message : err));
  page.on("requestfailed", req => {
    try { console.log("REQ FAIL:", req.url(), req.failure && req.failure().errorText); } catch (e) {}
  });
  page.on("response", res => {
    try { /* minimal noise: only log bad status */ if (res.status() >= 400) console.log("BAD RESPONSE:", res.status(), res.url()); } catch (e) {}
  });

  // request interception: block analytics/ads/fonts/images (configurable)
  try {
    await page.setRequestInterception(true);
    page.on("request", req => {
      const url = req.url().toLowerCase();
      const resourceType = req.resourceType ? req.resourceType() : req.resourceType;
      // short-list of trackers / heavy domains
      const blockedSubstrings = [
        "googlesyndication.com", "doubleclick.net", "google-analytics.com",
        "googletagmanager.com", "analytics", "facebook.net", "adsystem",
        "ads.", "adservice", "ads.", "hotjar", "tracker", "matomo",
      ];
      const isTracker = blockedSubstrings.some(s => url.includes(s));
      if (isTracker) return req.abort();

      if (BLOCK_IMAGES && (resourceType === "image" || url.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/))) {
        return req.abort();
      }
      // optionally block fonts to avoid remote font fetch stalls
      if (resourceType === "font" || url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
        return req.abort();
      }
      // otherwise continue
      return req.continue();
    });
  } catch (e) {
    // some environments disallow interception; continue anyway
    console.log("Warning: request interception failed:", e && e.message ? e.message : e);
  }

  // helper: exponential backoff navigation + waits
  async function navigateWithRetries(url, attempts) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      const attemptNum = i + 1;
      try {
        // try DOMContentLoaded (fast) first
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        // wait for main content to appear indicating page rendered
        await page.waitForSelector(SELECTOR, { timeout: WAIT_FOR_SELECTOR_MS });
        // give a short grace for any client rendering to finish
        await page.waitForTimeout(500);
        return; // success
      } catch (err) {
        lastErr = err;
        console.warn(`Navigation attempt ${attemptNum} failed: ${err && err.message ? err.message : err}`);
        // fallback: try networkidle2 once per attempt before retrying
        try {
          console.log("Fallback: trying networkidle2 with small timeout...");
          await page.goto(url, { waitUntil: "networkidle2", timeout: Math.max(30000, NAV_TIMEOUT_MS) });
          // try selector again
          await page.waitForSelector(SELECTOR, { timeout: Math.floor(WAIT_FOR_SELECTOR_MS / 2) });
          return; // success on fallback
        } catch (err2) {
          lastErr = err2;
          console.warn("Fallback networkidle2 failed:", err2 && err2.message ? err2.message : err2);
        }
      }
      // exponential backoff before next attempt
      const backoff = 2000 * Math.pow(2, i); // 2s, 4s, 8s...
      console.log(`Waiting ${backoff}ms before retrying...`);
      await page.waitForTimeout(backoff);
    }
    throw lastErr;
  }

  try {
    await navigateWithRetries(URL, RETRIES);

    // optional: remove request interception to get complete content (images blocked earlier if chosen)
    try { await page.setRequestInterception(false); } catch (e) {}

    // get HTML
    const html = await page.content();
    fs.writeFileSync(OUTPUT, html, "utf-8");
    console.log(`Rendered HTML saved to ${OUTPUT}`);
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("Final failure while rendering:", err && err.message ? err.message : err);

    // save debug artifacts
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const errHtmlPath = path.resolve(__dirname, `error-${timestamp}.html`);
      const screenshotPath = path.resolve(__dirname, `error-${timestamp}.png`);

      let fallbackHtml = "";
      try {
        fallbackHtml = await page.content();
        fs.writeFileSync(errHtmlPath, fallbackHtml, "utf-8");
        console.log("Wrote error HTML:", errHtmlPath);
      } catch (e) {
        console.warn("Could not save error HTML:", e && e.message ? e.message : e);
      }

      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log("Saved screenshot:", screenshotPath);
      } catch (e) {
        console.warn("Could not capture screenshot:", e && e.message ? e.message : e);
      }
    } catch (artifactErr) {
      console.warn("Failed to produce debug artifacts:", artifactErr && artifactErr.message ? artifactErr.message : artifactErr);
    } finally {
      try { await browser.close(); } catch (e) {}
      process.exit(1);
    }
  }
})();