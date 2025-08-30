const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion"; // Target page
  const outputDir = path.resolve(__dirname, "public");
  const outputFile = path.join(outputDir, "opinion.html");

  // Ensure public directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });

  // Get full rendered HTML
  const html = await page.content();

  fs.writeFileSync(outputFile, html, "utf-8");
  console.log(`Rendered HTML saved to ${outputFile}`);

  await browser.close();
})();
