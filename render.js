const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion";
  const outputFile = path.resolve(__dirname, "opinion.html");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log("Navigating to the page...");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait a bit for any lazy-loaded content
  await page.waitForTimeout(5000);

  // Save full page HTML
  const html = await page.content();
  fs.writeFileSync(outputFile, html, "utf-8");
  console.log(`Rendered HTML saved to ${outputFile} (${fs.statSync(outputFile).size} bytes)`);

  await browser.close();
})();
