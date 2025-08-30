const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.prothomalo.com/opinion"; 
  const outputFile = path.resolve(__dirname, "opinion.html");

  const browser = await puppeteer.launch({ 
    headless: false, // Set to true once working
    devtools: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  const page = await browser.newPage();
  
  // Set viewport and user agent
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  // Remove automation indicators
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  try {
    console.log("Navigating to URL...");
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });

    console.log("Waiting for initial content...");
    await page.waitForTimeout(5000);

    // Try to find and wait for article containers
    console.log("Looking for article containers...");
    const articleSelectors = [
      '[data-story-id]',
      '.story-card',
      '.article-card', 
      '.post',
      'article',
      '[class*="story"]',
      '[class*="article"]',
      '[class*="card"]'
    ];

    let foundSelector = null;
    for (const selector of articleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        foundSelector = selector;
        console.log(`Found articles with selector: ${selector}`);
        break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!foundSelector) {
      console.log("No specific article selectors found, proceeding with full page...");
    }

    // Aggressive scrolling and content loading
    console.log("Starting aggressive content loading...");
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;

    while (scrollAttempts < maxScrollAttempts) {
      // Scroll down
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Check for "Load More" buttons and click them
      try {
        const loadMoreFound = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a, div, span'));
          const loadMore = buttons.find(btn => {
            const text = btn.textContent.toLowerCase();
            return text.includes('load more') || 
                   text.includes('show more') || 
                   text.includes('আরো দেখুন') || 
                   text.includes('আরও পড়ুন') ||
                   text.includes('more stories') ||
                   text.includes('load') ||
                   btn.getAttribute('data-testid')?.includes('load') ||
                   btn.className.includes('load') ||
                   btn.className.includes('more');
          });
          
          if (loadMore && loadMore.offsetParent !== null) { // Check if visible
            loadMore.click();
            return true;
          }
          return false;
        });

        if (loadMoreFound) {
          console.log(`Clicked load more button (attempt ${scrollAttempts + 1})`);
          await page.waitForTimeout(3000);
        }
      } catch (e) {
        // Continue if button click fails
      }

      // Check if page height changed
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        // Try to trigger any lazy loading by scrolling up and down
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight * 0.8);
        });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(2000);
        
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === currentHeight) {
          console.log("No more content loading, stopping scroll");
          break;
        }
      }

      previousHeight = currentHeight;
      scrollAttempts++;
      console.log(`Scroll attempt ${scrollAttempts}, page height: ${currentHeight}`);
    }

    // Try to expand any collapsed content
    console.log("Looking for expandable content...");
    await page.evaluate(() => {
      const expandButtons = document.querySelectorAll('[aria-expanded="false"], .collapsed, .truncated, [data-truncated="true"]');
      expandButtons.forEach(btn => {
        try {
          if (btn.click) btn.click();
        } catch (e) {
          // Ignore click errors
        }
      });
    });

    await page.waitForTimeout(3000);

    // Final scroll to top to ensure all content is rendered
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    // Get article count for verification
    const articleCount = await page.evaluate((selector) => {
      if (selector) {
        return document.querySelectorAll(selector).length;
      }
      // Try to count articles using common patterns
      const selectors = ['article', '[data-story-id]', '.story-card', '.article-card', '.post'];
      for (const sel of selectors) {
        const count = document.querySelectorAll(sel).length;
        if (count > 0) return count;
      }
      return 0;
    }, foundSelector);

    console.log(`Found ${articleCount} articles`);

    // Get the final HTML content
    const html = await page.content();
    
    fs.writeFileSync(outputFile, html, "utf-8");
    console.log(`Rendered HTML saved to ${outputFile}`);
    console.log(`Content length: ${html.length} characters`);

    // Save a screenshot for debugging
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log("Debug screenshot saved as debug-screenshot.png");

  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }
})();      console.log("No load more buttons found");
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
