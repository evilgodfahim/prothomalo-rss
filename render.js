const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://news.google.com/publications/CAAqBwgKMOfGlwswmfCuAw?hl=bn&gl=BD&ceid=BD%3Abn";
  const outputFile = path.resolve(__dirname, "opinion.html");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForTimeout(5000); // lazy-load

  const html = await page.evaluate(() => {
    const article = document.querySelector('article'); // adjust selector
    if (!article) return '';

    // Remove ad containers
    const ads = article.querySelectorAll('iframe, .ad, .ads, .google-ad, [class*="banner"]');
    ads.forEach(ad => ad.remove());

    // Optionally, stop at “follow” link
    const followLink = Array.from(article.querySelectorAll('*'))
                            .find(el => el.textContent.includes('প্রথম আলোর খবর পেতে গুগল নিউজ চ্যানেল ফলো করুন'));
    if (followLink) {
      let stopNode = followLink.nextSibling;
      while (stopNode) {
        const next = stopNode.nextSibling;
        stopNode.remove();
        stopNode = next;
      }
    }

    return article.outerHTML;
  });

  fs.writeFileSync(outputFile, html, "utf-8");
  console.log(`Clean article saved to ${outputFile} (${fs.statSync(outputFile).size} bytes)`);

  await browser.close();
})();
