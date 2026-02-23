// render.js — robust, CI-safe Puppeteer render
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion";
  const outputFile = path.resolve(__dirname, "opinion.html");
  const screenshotFile = path.resolve(__dirname, "opinion-error.png");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--disable-accelerated-2d-canvas",
        "--no-zygote"
      ],
    });

    const page = await browser.newPage();

    // make navigation more tolerant
    page.setDefaultNavigationTimeout(120000); // 120s
    page.setDefaultTimeout(120000);

    // optional but stabilizes some sites
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // try goto with longer timeout and networkidle2
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

    // wait for a selector present on the page (if known). fallback short wait:
    await page.waitForTimeout(2000);

    const html = await page.content();
    fs.writeFileSync(outputFile, html, "utf-8");
    console.log(`Rendered HTML saved to ${outputFile}`);
  } catch (err) {
    console.error("Render failed:", err && err.message ? err.message : err);

    // capture screenshot when possible
    try {
      if (browser) {
        const pages = await browser.pages();
        if (pages && pages.length) await pages[0].screenshot({ path: screenshotFile, fullPage: true });
        console.error(`Screenshot saved to ${screenshotFile}`);
      }
    } catch (sErr) {
      console.error("Screenshot failed:", sErr && sErr.message ? sErr.message : sErr);
    }

    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();