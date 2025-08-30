const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion";
  const outputFile = path.resolve(__dirname, "opinion.html");

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  // Scroll to bottom to trigger lazy-loading
  await autoScroll(page);

  // Extract only the article list HTML
  const articlesHTML = await page.evaluate(() => {
    const container = document.querySelector('section.list-articles'); // adjust selector if needed
    return container ? container.outerHTML : '';
  });

  fs.writeFileSync(outputFile, articlesHTML, "utf-8");
  console.log(`Rendered article list saved to ${outputFile}`);

  await browser.close();

  // helper function to scroll page
  async function autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    // optional: wait a bit after scrolling for lazy-load
    await page.waitForTimeout(2000);
  }
})();
