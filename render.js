const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Move autoScroll function outside the main async function
async function autoScroll(page) {
  try {
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
    await page.waitForTimeout(2000);
  } catch (error) {
    console.warn("Scrolling failed, continuing without full scroll:", error.message);
  }
}

(async () => {
  let browser;
  let page;
  
  try {
    const url = "https://www.prothomalo.com/opinion";
    const outputFile = path.resolve(__dirname, "opinion.html");

    // Enhanced browser launch options
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows"
      ],
      timeout: 60000 // 60 second timeout
    });

    page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Add extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    console.log("Navigating to the page...");
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });

    console.log("Page loaded, starting scroll...");
    // Scroll to bottom to trigger lazy-loading
    await autoScroll(page);

    console.log("Extracting articles...");
    // Extract only the article list with error handling
    const articlesHTML = await page.evaluate(() => {
      try {
        const container = document.querySelector('section.list-articles');
        if (!container) {
          console.log("Container 'section.list-articles' not found");
          // Try alternative selectors
          const altContainer = document.querySelector('.list-articles') || 
                              document.querySelector('[class*="list"]') ||
                              document.querySelector('main') ||
                              document.querySelector('.content');
          return altContainer ? altContainer.outerHTML : document.body.innerHTML;
        }
        return container.outerHTML;
      } catch (error) {
        console.error("Error in page.evaluate:", error);
        return `<div>Error extracting content: ${error.message}</div>`;
      }
    });

    if (!articlesHTML || articlesHTML.trim() === '') {
      throw new Error("No content extracted from the page");
    }

    fs.writeFileSync(outputFile, articlesHTML, "utf-8");
    console.log(`Rendered article list saved to ${outputFile}`);
    console.log(`File size: ${fs.statSync(outputFile).size} bytes`);

  } catch (error) {
    console.error("Error occurred:", error.message);
    console.error("Stack trace:", error.stack);
    
    // Try to save whatever we can get
    if (page && !page.isClosed()) {
      try {
        const fallbackHTML = await page.content();
        const fallbackFile = path.resolve(__dirname, "opinion_fallback.html");
        fs.writeFileSync(fallbackFile, fallbackHTML, "utf-8");
        console.log(`Fallback HTML saved to ${fallbackFile}`);
      } catch (fallbackError) {
        console.error("Could not save fallback HTML:", fallbackError.message);
      }
    }
    
    process.exit(1);
  } finally {
    // Ensure browser is closed
    if (browser) {
      try {
        await browser.close();
        console.log("Browser closed successfully");
      } catch (closeError) {
        console.warn("Error closing browser:", closeError.message);
      }
    }
  }
})();
