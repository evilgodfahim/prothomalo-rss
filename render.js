const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion"; 
  const outputFile = path.resolve(__dirname, "opinion.html"); // save directly in root

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });

  const html = await page.content();
  fs.writeFileSync(outputFile, html, "utf-8");
  console.log(`Rendered HTML saved to ${outputFile}`);

  await browser.close();
})();
