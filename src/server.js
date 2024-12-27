import express from 'express';
import * as cheerio from 'cheerio';
import { handlePressAndHoldVerification, needsVerification, getBrowser, createPage } from './browser-utils.js';
import { rateLimiter } from './rate-limiter.js';
import db from './db.js';
import { parseFlightSegments, parseWaitlistForSegment } from './flight-utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

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
  
  const waitlistInfo = {
    capacity: null,
    available: null,
    checkedIn: null,
    names: []
  };

  // Find the upgrade requests container
  const upgradeContainer = $('div.waitlist-single-container').filter((_, container) => {
    return $(container).find('h4').text().includes('Upgrade requests');
  });

  if (upgradeContainer.length) {
    console.log('Found upgrade requests container');
    
    // Parse waitlist info
    const infoTexts = upgradeContainer.find('.waitlist-text-container span').map((_, el) => $(el).text()).get();
    infoTexts.forEach(text => {
      if (text.includes('capacity')) {
        waitlistInfo.capacity = parseInt(text.match(/\d+/)[0]);
      } else if (text.includes('Available')) {
        waitlistInfo.available = parseInt(text.match(/\d+/)[0]);
      } else if (text.includes('Checked-in')) {
        waitlistInfo.checkedIn = parseInt(text.match(/\d+/)[0]);
      }
    });

    // Parse names from the table
    const names = upgradeContainer
      .find('table.auro_table tbody tr')
      .map((_, row) => {
        const nameCell = $(row).find('td').eq(1);
        const name = nameCell.text().trim();
        if (name && /^[A-Z]{2,3}\/[A-Z]$/.test(name)) {
          return name;
        }
      })
      .get()
      .filter(Boolean);

    console.log('Found names:', names);
    waitlistInfo.names = names;
  } else {
    console.log('No upgrade requests container found');
  }

  console.log('Parsed waitlist info:', waitlistInfo);
  return waitlistInfo;
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

const logFile = './debug.log';

function debugLog(message, consoleOnly = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;
  
  // Always log to console
  console.log(message);
  
  // Log to file unless consoleOnly is true
  if (!consoleOnly) {
    fs.appendFileSync(logFile, logMessage);
  }
}

async function logDatabaseState() {
  try {
    debugLog('\n=== Current Database State ===', true);
    
    // Query flights table
    const flights = await db.db.all('SELECT * FROM flights ORDER BY flight_date DESC, flight_number');
    debugLog('\nFlights Table:', true);
    console.table(flights);

    // Query waitlist snapshots with flight info
    const snapshots = await db.db.all(`
      SELECT 
        w.*,
        f.flight_number,
        f.flight_date,
        f.origin,
        f.destination
      FROM waitlist_snapshots w
      JOIN flights f ON w.flight_id = f.id
      ORDER BY w.snapshot_time DESC
    `);
    debugLog('\nWaitlist Snapshots Table:', true);
    console.table(snapshots);
    
    debugLog('\n=== End Database State ===\n', true);
  } catch (error) {
    debugLog('Error logging database state: ' + error.message, true);
  }
}

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
    const $ = cheerio.load(content);

    // Parse all flight segments
    const segments = parseFlightSegments($);
    debugLog(`Found ${segments.length} flight segments`, true);
    segments.forEach((segment, i) => {
      debugLog(`Segment ${i + 1}:
        Flight: AS${segment.flightNumber}
        Route: ${segment.origin} → ${segment.destination}
        Date: ${segment.date}
        Departure: ${segment.departureTime}
        Arrival: ${segment.arrivalTime}`, true);
    });

    // Process each segment
    const processedSegments = await Promise.all(segments.map(async (segment, index) => {
      const waitlistInfo = parseWaitlistForSegment($, index);
      debugLog(`Waitlist info for segment ${index + 1}:`, true);
      debugLog(JSON.stringify(waitlistInfo, null, 2), true);
      
      // Save to database
      if (db.isDbAvailable && waitlistInfo) {
        const flightId = await db.saveFlightSegment(segment, index);
        if (flightId) {
          await db.saveWaitlistSnapshot(flightId, waitlistInfo);
        }
      }
      
      return {
        flightNumber: segment.flightNumber,
        date: segment.date,
        origin: segment.origin,
        destination: segment.destination,
        departureTime: segment.departureTime,
        arrivalTime: segment.arrivalTime,
        names: waitlistInfo ? waitlistInfo.names : [],
        waitlistInfo: {
          capacity: waitlistInfo ? waitlistInfo.capacity : null,
          available: waitlistInfo ? waitlistInfo.available : null,
          checkedIn: waitlistInfo ? waitlistInfo.checkedIn : null
        }
      };
    }));

    // Record successful scrape and send response
    rateLimiter.recordScrape(flightKey);
    
    debugLog('Sending response with segments:', true);
    debugLog(JSON.stringify(processedSegments, null, 2), true);

    await logDatabaseState();
    res.json({
      success: true,
      segments: processedSegments
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

app.get('/api/getCachedWaitlist', async (req, res) => {
  const { flightNumber, flightDate } = req.query;
  if (!flightNumber || !flightDate) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const segments = await db.getLatestWaitlistData(flightNumber, flightDate);
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rename existing endpoint to differentiate
app.post('/api/refreshWaitlist', async (req, res) => {
  // ... (existing trackWaitlist code) ...
});

const startServer = async (retries = 3) => {
  const findAvailablePort = async (startPort) => {
    for (let port = startPort; port < startPort + 10; port++) {
      try {
        await new Promise((resolve, reject) => {
          const server = app.listen(port)
            .once('listening', () => {
              resolve(server);
            })
            .once('error', (err) => {
              if (err.code === 'EADDRINUSE') {
                resolve(false);
              } else {
                reject(err);
              }
            });
        });
        console.log(`Server running at http://localhost:${port}`);
        return true;
      } catch (err) {
        console.error(`Failed to start server on port ${port}:`, err);
        if (retries <= 0) throw err;
      }
    }
    return false;
  };

  try {
    const success = await findAvailablePort(3000);
    if (!success && retries > 0) {
      console.log(`Retrying server start... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return startServer(retries - 1);
    } else if (!success) {
      throw new Error('Could not find available port after retries');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
