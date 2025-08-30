const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion"; 
  const outputFile = path.resolve(__dirname, "opinion.html");

  const browser = await puppeteer.launch({ 
    headless: true, 
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor"
    ]
  });

  const page = await browser.newPage();
  
  // Set viewport and user agent to mimic real browser
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  // Enable request interception to block unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // Navigate with longer timeout
    await page.goto(url, { 
      waitUntil: "networkidle0", 
      timeout: 60000 
    });

    // Wait for potential lazy-loaded content
    await page.waitForTimeout(3000);

    // Scroll to trigger any lazy loading
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Wait for any additional content to load after scrolling
    await page.waitForTimeout(2000);

    // Try to wait for specific content selectors (adjust based on site structure)
    try {
      await page.waitForSelector('article, .article, .story, .content, .post-content', { timeout: 10000 });
    } catch (e) {
      console.log("Specific content selectors not found, proceeding with full page...");
    }

    // Check if there are any "Load More" or "Show More" buttons and click them
    try {
      const loadMoreButtons = await page.$$eval(
        'button, a, span, div', 
        elements => elements.filter(el => 
          el.textContent.toLowerCase().includes('load more') ||
          el.textContent.toLowerCase().includes('show more') ||
          el.textContent.toLowerCase().includes('read more') ||
          el.textContent.toLowerCase().includes('বিস্তারিত') // Bengali for "details"
        )
      );
      
      if (loadMoreButtons.length > 0) {
        console.log(`Found ${loadMoreButtons.length} potential load more buttons`);
        for (let i = 0; i < Math.min(loadMoreButtons.length, 3); i++) {
          try {
            await page.click(loadMoreButtons[i]);
            await page.waitForTimeout(2000);
          } catch (e) {
            console.log(`Could not click load more button ${i + 1}`);
          }
        }
      }
    } catch (e) {
      console.log("No load more buttons found");
    }

    // Final wait for content to settle
    await page.waitForTimeout(2000);

    // Get the final HTML content
    const html = await page.content();
    
    // Optionally, extract just the article content (uncomment if needed)
    /*
    const articleContent = await page.evaluate(() => {
      // Try different selectors for article content
      const selectors = [
        'article',
        '.article',
        '.story-content',
        '.post-content',
        '.content',
        'main',
        '[role="main"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.outerHTML;
        }
      }
      
      return document.documentElement.outerHTML;
    });
    */

    fs.writeFileSync(outputFile, html, "utf-8");
    console.log(`Rendered HTML saved to ${outputFile}`);
    console.log(`Content length: ${html.length} characters`);

  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }
})();
