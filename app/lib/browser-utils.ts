import puppeteer, { Browser, Page } from 'puppeteer';
import { debugLog } from './server-utils';
import { exec } from 'child_process';

let browserInstance: Browser | null = null;
let connectionRetries = 0;
const MAX_RETRIES = 3;
const WS_ENDPOINT_RETRIES = 3;

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

export async function initBrowser(): Promise<Browser> {
  try {
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch (e) {
        debugLog('Failed to close existing browser: ' + (e instanceof Error ? e.message : 'Unknown error'));
      }
      browserInstance = null;
    }

    // Kill any existing Chrome processes that might interfere
    if (process.platform === 'darwin') {
      await new Promise<void>((resolve) => {
        exec('pkill -f "(Google Chrome)"', () => resolve());
      });
      await new Promise(r => setTimeout(r, 1000));
    }

    const config = getRandomBrowserConfig();
    let wsEndpointRetries = WS_ENDPOINT_RETRIES;
    let browser: Browser;

    while (wsEndpointRetries > 0) {
      try {
        const executablePath = process.platform === 'darwin' 
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : undefined;

        browser = await puppeteer.launch({
          headless: true,
          args: config.args,
          defaultViewport: config.viewport,
          executablePath,
          env: {
            ...process.env,
            DISPLAY: process.env.DISPLAY || ':0'
          }
        });

        // Test the connection immediately
        await new Promise(r => setTimeout(r, 1000));
        const pages = await browser.pages();
        if (pages.length === 0) {
          const testPage = await browser.newPage();
          await testPage.setUserAgent(config.userAgent);
          await testPage.evaluate(() => navigator.userAgent);
          await testPage.close();
        } else {
          await pages[0].setUserAgent(config.userAgent);
          await pages[0].evaluate(() => navigator.userAgent);
        }

        // Set up disconnect handler
        let reconnectTimeout: NodeJS.Timeout;
        browser.on('disconnected', async () => {
          debugLog('Browser disconnected, attempting to reconnect...');
          if (browserInstance === browser) {
            try {
              const pages = await browser.pages().catch(() => []);
              await Promise.all(pages.map(page => page.close().catch(() => {})));
              await browser.close().catch(() => {});
            } catch (e) {
              debugLog('Error cleaning up disconnected browser: ' + (e instanceof Error ? e.message : 'Unknown error'));
            }
            browserInstance = null;
          }

          if (reconnectTimeout) clearTimeout(reconnectTimeout);

          reconnectTimeout = setTimeout(async () => {
            if (connectionRetries < MAX_RETRIES) {
              connectionRetries++;
              debugLog(`Reconnection attempt ${connectionRetries}/${MAX_RETRIES}`);
              try {
                browserInstance = await initBrowser();
                connectionRetries = 0;
              } catch (e) {
                debugLog('Failed to reconnect: ' + (e instanceof Error ? e.message : 'Unknown error'));
                if (process.platform === 'darwin') {
                  exec('pkill -f "(Google Chrome)"');
                }
              }
            } else {
              debugLog('Max reconnection attempts reached');
              connectionRetries = 0;
            }
          }, 5000);
        });

        browserInstance = browser;
        return browser;
      } catch (e) {
        debugLog(`Browser connection failed (attempt ${WS_ENDPOINT_RETRIES - wsEndpointRetries + 1}): ${e instanceof Error ? e.message : 'Unknown error'}`);
        if (browser!) {
          try {
            const pages = await browser!.pages().catch(() => []);
            await Promise.all(pages.map(page => page.close().catch(() => {})));
            await browser!.close().catch(() => {});
          } catch (closeError) {
            debugLog('Error closing browser: ' + (closeError instanceof Error ? closeError.message : 'Unknown error'));
          }
        }
        wsEndpointRetries--;
        if (wsEndpointRetries === 0) throw e;
        const delay = Math.min(1000 * Math.pow(2, WS_ENDPOINT_RETRIES - wsEndpointRetries), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw new Error('Failed to initialize browser after all retries');
  } catch (error) {
    debugLog('Browser initialization error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await initBrowser();
  }
  return browserInstance;
}

export async function createPage(): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Set viewport and user agent
  const config = getRandomBrowserConfig();
  await page.setViewport(config.viewport);
  await page.setUserAgent(config.userAgent);

  // Set up error handling for the page
  page.on('error', err => {
    debugLog('Page error: ' + err.message);
  });

  page.on('pageerror', err => {
    debugLog('Page error: ' + (err instanceof Error ? err.message : String(err)));
  });

  return page;
}

export async function needsVerification(page: Page): Promise<boolean> {
  try {
    const verificationElement = await page.$('#px-captcha');
    return !!verificationElement;
  } catch (error) {
    debugLog('Error checking verification: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return false;
  }
}

export async function handlePressAndHoldVerification(page: Page, maxRetries = 2): Promise<boolean> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const verificationButton = await page.$('#px-captcha');
      if (!verificationButton) {
        return false;
      }

      const boundingBox = await verificationButton.boundingBox();
      if (!boundingBox) {
        return false;
      }

      const x = boundingBox.x + boundingBox.width / 2;
      const y = boundingBox.y + boundingBox.height / 2;

      // Random mouse movement before clicking
      const randomMove = () => {
        const offsetX = Math.random() * 100 - 50;
        const offsetY = Math.random() * 100 - 50;
        return page.mouse.move(x + offsetX, y + offsetY);
      };

      await randomMove();
      await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
      await randomMove();
      await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
      
      await page.mouse.move(x, y);
      await page.mouse.down();
      await new Promise(resolve => setTimeout(resolve, 16000));
      await page.mouse.up();

      // Wait for verification to complete
      await page.waitForFunction(
        () => !document.querySelector('#px-captcha'),
        { timeout: 8000 }
      );

      return true;
    } catch (error) {
      debugLog('Error handling verification: ' + (error instanceof Error ? error.message : 'Unknown error'));
      retries++;
      if (retries === maxRetries) {
        return false;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}