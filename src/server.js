import express from 'express';
import * as cheerio from 'cheerio';
import { handlePressAndHoldVerification, needsVerification, getBrowser, createPage } from './browser-utils.js';
import { rateLimiter } from './rate-limiter.js';
import db from './db.js';

const app = express();
app.use(express.static('../public'));
app.use(express.json());

/** 
 * In-memory store of waitlists keyed by flightNumber+flightDate:
 * {
 *   "3411|2024-12-29": {
 *       waitlist: ["KUM/V", "JIN/K", ...],
 *       timestamp: 1699999999
 *   },
 *   ...
 * }
 */
const previousWaitlists = {};

/** 
 * Utility: parse all "Guest" names in the Waitlists, but only from the Upgrade requests section
 */
async function parseWaitlistNames(html) {
  const $ = cheerio.load(html);
  console.log('\n=== Starting HTML Parse ===');
  
  const containers = $('[class*="waitlist"], .upgrade-container, div:contains("Upgrade")');
  console.log('\nFound containers with classes:', containers.map((_, el) => $(el).attr('class')).get());
  
  const names = [];
  
  containers.each((_, container) => {
    console.log('\n=== Container Content ===');
    console.log('Container HTML:', $(container).html());
    console.log('Container text:', $(container).text());
    
    // Look for any table structure or list structure
    const rows = $(container).find('tr, .waitlist-row, .row, div[class*="row"]');
    console.log(`\nFound ${rows.length} rows in container`);
    
    rows.each((rowIndex, row) => {
      console.log(`\n--- Row ${rowIndex + 1} Content ---`);
      console.log('Row classes:', $(row).attr('class'));
      console.log('Row HTML:', $(row).html());
      console.log('Row text:', $(row).text().trim());
      
      // Look for cells with potential names
      const cells = $(row).find('td, div, span');
      cells.each((cellIndex, cell) => {
        const cellText = $(cell).text().trim();
        console.log(`Cell ${cellIndex + 1} text: "${cellText}"`);
        
        // Check for name pattern (XXX/X)
        if (/^[A-Z]{2,3}\/[A-Z]/.test(cellText)) {
          console.log(`Found name match: ${cellText}`);
          if (!names.includes(cellText)) {
            names.push(cellText);
          }
        }
      });
    });
  });

  console.log('\n=== Final Results ===');
  console.log('Total names found:', names.length);
  console.log('Names:', names);
  return names;
}

/** 
 * A super-simple fuzzy match. For each character in `userName`, count how many are in `candidate`.
 * Then return ratio (0..1). 
 */
function fuzzyMatch(userName, candidate) {
  const lowerUser = userName.toLowerCase();
  const lowerCand = candidate.toLowerCase();
  let matchCount = 0;
  
  for (let ch of lowerUser) {
    if (lowerCand.includes(ch)) {
      matchCount++;
    }
  }
  return matchCount / lowerUser.length;
}

/** 
 * Compare old waitlist array vs. new waitlist array:
 * Returns { newNames: [], droppedNames: [] }
 */
function compareWaitlists(oldList, newList) {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  const newNames = newList.filter(n => !oldSet.has(n));
  const droppedNames = oldList.filter(n => !newSet.has(n));
  return { newNames, droppedNames };
}

async function getWaitlistInfo(page) {
  const waitlistInfo = {
    capacity: null,
    available: null,
    checkedIn: null
  };

  try {
    // Find specifically the upgrade requests container
    const containers = await page.$$('.waitlist-single-container');
    for (const container of containers) {
      const headerText = await container.$eval('h4', el => el.textContent).catch(() => '');
      if (headerText && headerText.includes('Upgrade')) {
        const spans = await container.$$('span');
        for (const span of spans) {
          const text = await span.evaluate(el => el.textContent).catch(() => '');
          if (text) {
            const numbers = text.match(/\d+/);
            if (text.includes('capacity') && numbers) {
              waitlistInfo.capacity = parseInt(numbers[0]);
            } else if (text.includes('Available') && numbers) {
              waitlistInfo.available = parseInt(numbers[0]);
            } else if (text.includes('Checked-in') && numbers) {
              waitlistInfo.checkedIn = parseInt(numbers[0]);
            }
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error parsing waitlist info:', error);
  }

  // Log the results for debugging
  console.log('Parsed waitlist info:', waitlistInfo);
  return waitlistInfo;
}

// Initialize database on startup
db.initDb().catch(console.error);

app.post('/api/trackWaitlist', async (req, res) => {
  const { flightNumber, flightDate, userName } = req.body;
  if (!flightNumber || !flightDate || !userName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const flightKey = `${flightNumber}|${flightDate}`;
  
  // Check rate limit
  if (!rateLimiter.canScrape(flightKey)) {
    const waitTime = rateLimiter.getTimeUntilNextScrape(flightKey);
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      waitTimeMs: waitTime,
      message: `Please wait ${Math.ceil(waitTime / 1000)} seconds before trying again.`
    });
  }

  const url = `https://www.alaskaair.com/status/${flightNumber}/${flightDate}`;
  console.log('Fetching:', url);

  let page;
  try {
    // Create a new page with error handling
    page = await createPage();
    
    // Log page title and content for debugging
    page.on('console', msg => console.log('Page log:', msg.text()));

    await page.goto(url, { 
      waitUntil: ['domcontentloaded'],
      timeout: 30000 
    });

    // Log page title and initial content
    const pageTitle = await page.title();
    console.log('Page Title:', pageTitle);
    const pageContent = await page.content();
    console.log('Initial Page Content:', pageContent.substring(0, 500) + '...');

    // Add random mouse movements before checking content
    await page.mouse.move(100, 100);
    await page.waitForTimeout(Math.random() * 1000 + 500);
    await page.mouse.move(200, 150);
    await page.waitForTimeout(Math.random() * 1000 + 500);

    let verificationAttempts = 0;
    const maxVerificationAttempts = 3;

    while (verificationAttempts < maxVerificationAttempts) {
      if (await needsVerification(page)) {
        console.log(`Verification attempt ${verificationAttempts + 1}/${maxVerificationAttempts}`);
        console.log('Bot detection found, attempting press-and-hold verification...');
        
        // Add random mouse movement before verification
        await page.mouse.move(300 + Math.random() * 50, 200 + Math.random() * 50);
        await page.waitForTimeout(Math.random() * 1000 + 500);
        
        const verificationSuccess = await handlePressAndHoldVerification(page);
        
        if (verificationSuccess) {
          console.log('Press-and-hold verification successful!');
          // Wait a bit after successful verification
          await page.waitForTimeout(2000);
          break;
        } else {
          console.log('Press-and-hold verification failed, retrying...');
          verificationAttempts++;
          if (verificationAttempts === maxVerificationAttempts) {
            throw new Error('Failed to pass verification after multiple attempts');
          }
          // Wait before retrying
          await page.waitForTimeout(2000);
        }
      } else {
        console.log('No verification needed, proceeding with content check');
        break;
      }
    }

    // After verification, log the new page content
    console.log('Page content after verification:', (await page.content()).substring(0, 500) + '...');

    // Try multiple selectors in case the structure changes
    const waitlistSelectors = [
      '.waitlist-text-container',
      '.waitlist-single-container',
      '[class*="waitlist"]',
      'h4',  // Changed from h4:contains("Upgrade") to simpler selector
    ];

    let hasWaitlist = false;
    for (const selector of waitlistSelectors) {
      try {
        const elements = await page.$$(selector);
        console.log(`Checking selector "${selector}" - found ${elements.length} elements`);
        
        // For h4 elements, check their text content
        if (selector === 'h4') {
          for (const element of elements) {
            const text = await page.evaluate(el => el.textContent, element);
            console.log(`Found h4 with text: "${text}"`);
            if (text.toLowerCase().includes('upgrade')) {
              hasWaitlist = true;
              break;
            }
          }
        } else {
          hasWaitlist = elements.length > 0;
        }
        
        if (hasWaitlist) break;
      } catch (e) {
        console.log(`Error checking selector "${selector}":`, e.message);
      }
    }

    if (!hasWaitlist) {
      throw new Error('Could not find waitlist content after multiple attempts');
    }
    
    const content = await page.content();
    const names = await parseWaitlistNames(content);
    const waitlistInfo = await getWaitlistInfo(page);

    // Record successful scrape
    rateLimiter.recordScrape(flightKey);

    // Store in database and send response
    const previousData = previousWaitlists[flightKey];
    const changes = previousData ? compareWaitlists(previousData.waitlist, names) : { newNames: names, droppedNames: [] };
    
    previousWaitlists[flightKey] = {
      waitlist: names,
      timestamp: Date.now()
    };

    // Store in database
    if (db.isDbAvailable) {
      const flightId = await db.saveFlightInfo(
        flightNumber, 
        flightDate,
        null, // departureTime - not available in current implementation
        null, // origin - not available in current implementation
        null  // destination - not available in current implementation
      );
      
      await db.saveWaitlistSnapshot(flightId, names, waitlistInfo);
    }

    res.json({ 
      success: true, 
      names, 
      waitlistInfo,
      changes,
      nextScrapeAvailableIn: rateLimiter.intervalMs
    });
  } catch (error) {
    console.error('Error in trackWaitlist:', error);
    
    // Handle specific error cases
    if (error.message.includes('Session closed') || 
        error.message.includes('Target closed') ||
        error.message.includes('Connection closed') ||
        error.message.includes('socket hang up')) {
      // Don't count connection errors against rate limit
      rateLimiter.clearLimit(flightKey);
      return res.status(503).json({ 
        error: 'Temporary connection issue',
        message: 'Please try again in a few moments'
      });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
