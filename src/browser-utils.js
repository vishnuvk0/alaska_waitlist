import puppeteer from 'puppeteer';

let browserInstance = null;
let connectionRetries = 0;
const MAX_RETRIES = 3;
const WS_ENDPOINT_RETRIES = 3;

/**
 * Generate random browser configuration
 */
function getRandomBrowserConfig() {
  const screenWidth = 1920;
  const screenHeight = 1080;
  const osVersion = 10 + Math.floor(Math.random() * 3);
  const chromeVersion = 110 + Math.floor(Math.random() * 10);
  const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}_${Math.floor(Math.random() * 9)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;
  
  return {
    viewport: { width: screenWidth, height: screenHeight },
    userAgent,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      `--window-size=${screenWidth},${screenHeight}`,
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-notifications',
      `--user-agent=${userAgent}`,
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-sync',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--disable-features=TranslateUI',
      '--disable-renderer-backgrounding',
      '--disable-background-networking',
      '--disable-ipc-flooding-protection',
      '--enable-automation',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-blink-features=AutomationControlled'
    ]
  };
}

/**
 * Initialize browser with optimal settings and connection handling
 */
export async function initBrowser() {
  try {
    // If browser exists but is disconnected, clean it up
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch (e) {
        console.log('Failed to close existing browser:', e.message);
      }
      browserInstance = null;
    }

    // Kill any existing Chrome processes that might interfere
    try {
      if (process.platform === 'darwin') {
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          exec('pkill -f "(Google Chrome)"', (error) => {
            // Ignore errors as the process might not exist
            resolve();
          });
        });
        // Wait a moment for processes to clean up
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.log('Error cleaning up Chrome processes:', e.message);
    }

    const config = getRandomBrowserConfig();
    let wsEndpointRetries = WS_ENDPOINT_RETRIES;
    let browser;

    while (wsEndpointRetries > 0) {
      try {
        // Try to find Chrome installation
        const executablePath = process.platform === 'darwin' 
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : undefined;

        browser = await puppeteer.launch({
          headless: "new",
          args: config.args,
          ignoreHTTPSErrors: true,
          pipe: false,
          timeout: 30000,
          protocolTimeout: 30000,
          waitForInitialPage: false,
          handleSIGINT: true,
          handleSIGTERM: true,
          handleSIGHUP: true,
          defaultViewport: config.viewport,
          executablePath,
          env: {
            ...process.env,
            DISPLAY: process.env.DISPLAY || ':0'
          },
          // Increase timeouts
          connectionTimeout: 60000, // Increased timeout
          browserWSEndpoint: null,
          product: 'chrome'
        });

        // Set up error handlers for the browser process
        const browserProcess = browser.process();
        if (browserProcess) {
          browserProcess.on('error', (err) => {
            console.error('Browser process error:', err);
          });
          
          browserProcess.on('exit', (code, signal) => {
            console.log(`Browser process exited with code ${code} and signal ${signal}`);
            if (browserInstance === browser) {
              browserInstance = null;
            }
          });
        }

        // Test the connection immediately but with better error handling
        try {
          // Wait a moment before testing connection
          await new Promise(r => setTimeout(r, 1000));
          
          const pages = await browser.pages();
          if (pages.length === 0) {
            const testPage = await browser.newPage();
            await testPage.setUserAgent(config.userAgent);
            // Test basic browser functionality
            await testPage.evaluate(() => navigator.userAgent);
            await testPage.close();
          } else {
            await pages[0].setUserAgent(config.userAgent);
            // Test basic browser functionality
            await pages[0].evaluate(() => navigator.userAgent);
          }
          break;
        } catch (pageError) {
          console.error('Error during page creation:', pageError);
          await browser.close().catch(() => {});
          throw pageError;
        }
      } catch (e) {
        console.error(`Browser connection failed (attempt ${WS_ENDPOINT_RETRIES - wsEndpointRetries + 1}):`, e.message);
        if (browser) {
          try {
            const pages = await browser.pages().catch(() => []);
            await Promise.all(pages.map(page => page.close().catch(() => {})));
            await browser.close().catch(() => {});
          } catch (closeError) {
            console.error('Error closing browser:', closeError.message);
          }
        }
        wsEndpointRetries--;
        if (wsEndpointRetries === 0) throw e;
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, WS_ENDPOINT_RETRIES - wsEndpointRetries), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Set up disconnect handler with debouncing and better cleanup
    let reconnectTimeout;
    browser.on('disconnected', async () => {
      console.log('Browser disconnected, attempting to reconnect...');
      if (browserInstance === browser) {
        try {
          const pages = await browser.pages().catch(() => []);
          await Promise.all(pages.map(page => page.close().catch(() => {})));
          await browser.close().catch(() => {});
        } catch (e) {
          console.error('Error cleaning up disconnected browser:', e);
        }
        browserInstance = null;
      }

      // Clear any existing timeout
      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      // Debounce reconnection attempts
      reconnectTimeout = setTimeout(async () => {
        if (connectionRetries < MAX_RETRIES) {
          connectionRetries++;
          console.log(`Reconnection attempt ${connectionRetries}/${MAX_RETRIES}`);
          try {
            browserInstance = await initBrowser();
            connectionRetries = 0; // Reset on successful connection
          } catch (e) {
            console.error('Failed to reconnect:', e);
            // If we failed to reconnect, try to clean up any zombie processes
            if (process.platform === 'darwin') {
              const { exec } = require('child_process');
              exec('pkill -f "(Google Chrome)"');
            }
          }
        } else {
          console.error('Max reconnection attempts reached');
          connectionRetries = 0;
        }
      }, 5000); // Even longer debounce timeout
    });

    browserInstance = browser;
    return browser;
  } catch (error) {
    console.error('Browser initialization error:', error);
    throw error;
  }
}

/**
 * Get an active browser instance, creating one if necessary
 */
export async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await initBrowser();
  }
  return browserInstance;
}

/**
 * Create a new page with error handling and randomization
 */
export async function createPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Set up error handling for the page
  page.on('error', err => {
    console.error('Page error:', err);
  });

  page.on('pageerror', err => {
    console.error('Page error:', err);
  });

  // Randomize viewport and user agent
  const config = getRandomBrowserConfig();
  await page.setViewport(config.viewport);
  await page.setUserAgent(config.userAgent);

  // Add random mouse movements
  await page.evaluate(() => {
    const randomMove = () => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      const event = new MouseEvent('mousemove', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      });
      document.dispatchEvent(event);
    };
    setInterval(randomMove, Math.random() * 2000 + 1000);
  });

  return page;
}

/**
 * Handles the press and hold verification challenge with retry logic
 * @param {puppeteer.Page} page - Puppeteer page object
 * @returns {Promise<boolean>} - Returns true if verification appears successful
 */
export async function handlePressAndHoldVerification(page, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxRetries} for verification`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Calculate a random position within the button's bounds
      const buttonX = Math.floor(Math.random() * (1096 - 872) + 872);
      const buttonY = Math.floor(Math.random() * (617 - 615) + 615);

      console.log(`Attempting press-and-hold verification at coordinates: ${buttonX}, ${buttonY}`);
      
      // Ensure mouse is released before starting
      await page.mouse.up().catch(() => {});
      
      // Move to the calculated position
      await page.mouse.move(buttonX, buttonY);
      
      // Press and hold for 15 seconds
      await page.mouse.down();
      await new Promise(resolve => setTimeout(resolve, 15000));
      await page.mouse.up();
      
      // Wait briefly to check the result
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify if we passed the challenge
      const title = await page.title();
      const content = await page.content();
      
      if (title.includes('been denied') || content.includes('Access to this page has been denied')) {
        console.log('Verification failed - detected denial message');
        if (attempt === maxRetries) return false;
        continue;
      }
      
      return true;
    } catch (error) {
      console.error(`Error during press-and-hold verification (attempt ${attempt + 1}):`, error);
      if (attempt === maxRetries) return false;
    }
  }
  return false;
}

/**
 * Checks if the page needs verification with improved error handling
 * @param {puppeteer.Page} page - Puppeteer page object
 * @returns {Promise<boolean>}
 */
export async function needsVerification(page) {
  try {
    // Quick check for waitlist container
    const hasWaitlist = await page.$('.waitlist-text-container.svelte-fawh78')
      .then(element => !!element)
      .catch(() => false);
    
    if (hasWaitlist) {
      return false;
    }
    
    // Check for verification indicators
    const title = await page.title();
    const content = await page.content();
    
    const needsVerify = title.includes('Verify') || 
                       title.includes('Security') || 
                       content.includes('Press & Hold') ||
                       content.includes('verify you are a human');
    
    if (needsVerify) {
      console.log('Verification needed - detected verification page');
    }
    
    return needsVerify;
  } catch (error) {
    console.error('Error checking verification status:', error);
    // Only assume verification needed if we can still interact with the page
    return !error.message.includes('Session closed') && 
           !error.message.includes('Target closed') && 
           !error.message.includes('Connection closed');
  }
} 