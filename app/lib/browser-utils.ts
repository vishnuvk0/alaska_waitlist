import puppeteer, { Browser, Page } from 'puppeteer';
import { debugLog } from './server-utils';
import { exec } from 'child_process';
import { captureVerificationProcess } from './screenshot-utils';

let browserInstance: Browser | null = null;
let browserInitPromise: Promise<Browser> | null = null;
const MAX_RETRIES = 3;

interface BrowserConfig {
  viewport: {
    width: number;
    height: number;
  };
  userAgent: string;
  args: string[];
}

function getRandomBrowserConfig(): BrowserConfig {
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

async function findChromeExecutable(): Promise<string | undefined> {
  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chrome'
  ];

  for (const path of possiblePaths) {
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`${path} --version`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      debugLog(`Found Chrome executable at: ${path}`);
      return path;
    } catch (e) {
      continue;
    }
  }
  return undefined;
}

async function testChromeExecution(): Promise<void> {
  const execPath = await findChromeExecutable();
  return new Promise((resolve, reject) => {
    exec(`${execPath} --version`, (error, stdout, stderr) => {
      debugLog(`Chrome version test output: ${stdout}`);
      if (stderr) debugLog(`Chrome stderr: ${stderr}`);
      if (error) {
        debugLog(`Chrome execution error: ${error.message}`);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function testBrowserConnection(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  try {
    debugLog('Testing browser connection...');
    await page.setDefaultNavigationTimeout(90000);
    await page.setDefaultTimeout(90000);
    await page.goto('https://www.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    debugLog('Browser connection test successful');
  } catch (error) {
    debugLog(`Browser connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function initBrowser(): Promise<Browser> {
  debugLog('Starting browser initialization...');
  
  // Clean up existing browser
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }

  const execPath = await findChromeExecutable();
  if (!execPath) {
    throw new Error('Chrome executable not found');
  }

  debugLog(`Launching browser with executable: ${execPath}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: execPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--headless',
      '--hide-scrollbars',
      '--mute-audio'
    ],
    defaultViewport: {
      width: 1280,
      height: 800
    },
    timeout: 30000
  });

  browserInstance = browser;
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.process() !== null) {
    return browserInstance;
  }

  // If there's already a browser initialization in progress, wait for it
  if (browserInitPromise) {
    return browserInitPromise;
  }

  // Start new browser initialization
  browserInitPromise = initBrowser().finally(() => {
    browserInitPromise = null;
  });

  return browserInitPromise;
}

export async function createPage(): Promise<Page> {
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      
      // Set viewport and user agent
      const config = getRandomBrowserConfig();
      await page.setViewport(config.viewport);
      await page.setUserAgent(config.userAgent);

      // Enable request interception
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Set up error handling
      page.on('error', err => {
        debugLog('Page error: ' + err.message);
      });

      page.on('pageerror', err => {
        debugLog('Page error: ' + (err instanceof Error ? err.message : String(err)));
      });

      // Test page is working
      await page.evaluate(() => navigator.userAgent);
      
      return page;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      debugLog(`Failed to create page (attempt ${retryCount + 1}): ${lastError.message}`);
      retryCount++;
      
      if (retryCount === MAX_RETRIES) {
        throw lastError;
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error('Failed to create page after all retries');
}

export async function needsVerification(page: Page): Promise<boolean> {
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
                       content.includes('verify you are a human') ||
                       await page.$('#px-captcha').then(el => !!el).catch(() => false);
    
    if (needsVerify) {
      debugLog('Verification needed - detected verification page');
    }
    
    return needsVerify;
  } catch (error) {
    debugLog('Error checking verification: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return false;
  }
}

export async function handlePressAndHoldVerification(page: Page, maxRetries = 2): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        debugLog(`Retry attempt ${attempt}/${maxRetries} for verification`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Start screenshot recording
      const stopScreenshots = await captureVerificationProcess(page);

      // Wait for any animations to complete
      await new Promise(r => setTimeout(r, 2000));

      // Use the known working coordinates with slight randomization
      const buttonX = Math.floor(Math.random() * (1096 - 872) + 872);
      const buttonY = Math.floor(Math.random() * (617 - 615) + 615);

      debugLog(`Attempting press-and-hold verification at coordinates: ${buttonX}, ${buttonY}`);
      
      // Ensure mouse is released and reset position
      await page.mouse.up().catch(() => {});
      await page.mouse.move(0, 0);
      await new Promise(r => setTimeout(r, 500));
      
      // Move to the position gradually
      await page.mouse.move(buttonX, buttonY, { steps: 10 });
      await new Promise(r => setTimeout(r, 1000));
      
      // Press and hold for exactly 15 seconds
      await page.mouse.down();
      debugLog('Started mouse down');
      await new Promise(resolve => setTimeout(resolve, 15000));
      debugLog('Completed 15s hold, releasing');
      await page.mouse.up();
      
      // Wait to check the result
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Stop screenshot recording
      await stopScreenshots();
      
      // Multiple verification checks
      const title = await page.title();
      const content = await page.content();
      const stillHasVerification = await page.$('#px-captcha').then(el => !!el).catch(() => false);
      const hasWaitlist = await page.$('.waitlist-text-container').then(el => !!el).catch(() => false);
      
      if (title.includes('been denied') || 
          content.includes('Access to this page has been denied') || 
          stillHasVerification) {
        debugLog('Verification failed - detected denial message or verification still present');
        if (attempt === maxRetries) return false;
        continue;
      }

      if (hasWaitlist) {
        debugLog('Verification successful - waitlist container found');
        return true;
      }
      
      // If we get here, do one final check
      await new Promise(r => setTimeout(r, 2000));
      if (await needsVerification(page)) {
        debugLog('Verification still needed after final check');
        if (attempt === maxRetries) return false;
        continue;
      }
      
      return true;
    } catch (error) {
      debugLog('Error during press-and-hold verification: ' + (error instanceof Error ? error.message : 'Unknown error'));
      if (attempt === maxRetries) return false;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}