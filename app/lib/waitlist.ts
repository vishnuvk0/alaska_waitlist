import { Page } from 'puppeteer';
import { CheerioAPI } from 'cheerio';
import { createPage, needsVerification, handlePressAndHoldVerification } from './browser-utils';
import { parseFlightSegments, parseWaitlistForSegment } from './flight-utils';
import db from './db';
import { debugLog } from './server-utils';
import * as cheerio from 'cheerio';

export interface WaitlistSegment {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  position: number | null;
  totalWaitlisted: number | null;
  names?: string[];
  error?: string;
  waitlistInfo?: {
    capacity: number | null;
    available: number | null;
    checkedIn: number | null;
  };
}

export interface WaitlistResult {
  segments: WaitlistSegment[];
  error?: string;
}

async function getPageContent(page: Page): Promise<string> {
  try {
    return await page.content();
  } catch (error) {
    debugLog('Error getting page content: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    return '';
  }
}

function convertDateFormat(dateStr: string): string {
  // If it's already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Parse the date string (e.g., "December 29, 2024")
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  // Convert to YYYY-MM-DD format
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function trackWaitlist(
  flightNumber: string,
  flightDate: string,
  userName: string,
  forceRefresh: boolean = false
): Promise<WaitlistResult> {
  // First check the database
  if (!forceRefresh) {
    try {
      // Convert the input date to database format for comparison
      const dbFlightDate = convertDateFormat(flightDate);
      debugLog(`Checking database for flight ${flightNumber} on ${dbFlightDate}`);
      
      const cachedData = await db.getLatestWaitlistData(flightNumber, dbFlightDate);
      if (cachedData && cachedData.length > 0) {
        // Check if data is less than 5 minutes old
        const latestSnapshot = cachedData[0];
        const snapshotTime = new Date(latestSnapshot.snapshot_time);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (snapshotTime > fiveMinutesAgo) {
          debugLog('Using cached data from database');
          
          // Process cached data synchronously
          const segments: WaitlistSegment[] = [];
          for (const record of cachedData) {
            try {
              const names = JSON.parse(record.waitlist_names || '[]');
              const nameIndex = names.findIndex((name: string) => name === userName);
              segments.push({
                flightNumber: record.flight_number,
                date: record.flight_date,
                origin: record.origin || 'Unknown',
                destination: record.destination || 'Unknown',
                departureTime: record.departure_time || 'Unknown',
                arrivalTime: record.arrival_time || 'Unknown',
                position: nameIndex !== -1 ? nameIndex + 1 : null,
                totalWaitlisted: names.length,
                names,
                waitlistInfo: {
                  capacity: record.first_class_capacity,
                  available: record.first_class_available,
                  checkedIn: record.first_class_checked_in
                }
              });
            } catch (error) {
              debugLog('Error parsing cached record: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
              segments.push({
                flightNumber: record.flight_number,
                date: record.flight_date,
                origin: 'Unknown',
                destination: 'Unknown',
                departureTime: 'Unknown',
                arrivalTime: 'Unknown',
                position: null,
                totalWaitlisted: null,
                error: 'Error parsing cached data'
              });
            }
          }
          return { segments };
        } else {
          debugLog('Cache miss: Data is older than 5 minutes');
        }
      } else {
        debugLog('Cache miss: No data found in database');
      }
    } catch (error) {
      debugLog('Error checking cache: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  } else {
    debugLog('Bypassing cache due to force refresh');
  }

  // If we get here, it means we had a cache miss or force refresh
  debugLog('Fetching fresh data from Alaska Airlines website');
  let page: Page | undefined;
  
  try {
    page = await createPage();
    // Convert date to YYYY-MM-DD format for Alaska Airlines URL
    const urlDate = convertDateFormat(flightDate);
    const url = `https://www.alaskaair.com/status/${flightNumber}/${urlDate}`;
    
    debugLog(`Navigating to ${url}`);
    
    // Add retry logic for navigation
    let retryCount = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle0', 
          timeout: 30000 
        });
        
        // Wait for critical elements
        await Promise.race([
          page.waitForSelector('.waitlist-text-container', { timeout: 5000 }),
          page.waitForSelector('.accordion-container-fs', { timeout: 5000 })
        ]).catch(() => {});

        // If we get here without error, break the retry loop
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        debugLog(`Navigation attempt ${retryCount + 1} failed: ${lastError.message}`);
        
        // Check if browser is still connected
        if (!page.browser().isConnected()) {
          debugLog('Browser disconnected, creating new page...');
          await page.close().catch(() => {});
          page = await createPage();
        }
        
        retryCount++;
        if (retryCount === maxRetries) {
          throw lastError;
        }
        
        // Wait before retry
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    
    if (await needsVerification(page)) {
      debugLog('Verification needed, attempting to handle...');
      const verificationSuccess = await handlePressAndHoldVerification(page);
      if (!verificationSuccess) {
        throw new Error('Failed to complete verification');
      }
      await page.waitForSelector('.waitlist-text-container', { timeout: 2000 }).catch(() => {});
    }

    const content = await getPageContent(page);
    if (!content) {
      throw new Error('Failed to get page content');
    }
    
    const $ = cheerio.load(content);

    // Parse flight segments
    const segments = parseFlightSegments($);
    if (!segments.length) {
      throw new Error('No flight segments found');
    }

    debugLog(`Found ${segments.length} flight segments`);

    // Process each segment
    const processedSegments: WaitlistSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      debugLog(`Processing segment ${i + 1}: ${segment.flightNumber} from ${segment.origin} to ${segment.destination}`);

      try {
        // Get waitlist info for this segment
        const waitlistInfo = parseWaitlistForSegment($, i);
        
        // Save to database
        const flightId = await db.saveFlightSegment({
          ...segment,
          date: convertDateFormat(segment.date)
        }, i);
        if (flightId && waitlistInfo) {
          await db.saveWaitlistSnapshot(flightId, waitlistInfo);
        }

        // Calculate position and total
        const nameIndex = waitlistInfo?.names.findIndex(name => name === userName) ?? -1;
        const position = nameIndex !== -1 ? nameIndex + 1 : null;
        const totalWaitlisted = waitlistInfo?.names.length ?? null;

        processedSegments.push({
          ...segment,
          position,
          totalWaitlisted,
          names: waitlistInfo?.names || [],
          waitlistInfo: waitlistInfo ? {
            capacity: waitlistInfo.capacity,
            available: waitlistInfo.available,
            checkedIn: waitlistInfo.checkedIn
          } : undefined
        });
      } catch (error) {
        debugLog(`Error processing segment ${i + 1}: ` + (error instanceof Error ? error.message : 'Unknown error'), 'error');
        processedSegments.push({
          ...segment,
          position: null,
          totalWaitlisted: null,
          error: 'Error processing segment'
        });
      }
    }

    return {
      segments: processedSegments
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    debugLog('Error tracking waitlist: ' + errorMessage, 'error');
    
    return {
      segments: [{
        flightNumber,
        date: flightDate,
        origin: 'Unknown',
        destination: 'Unknown',
        departureTime: 'Unknown',
        arrivalTime: 'Unknown',
        position: null,
        totalWaitlisted: null,
        error: errorMessage
      }],
      error: errorMessage
    };
  } finally {
    if (page) {
      await page.close().catch(error => {
        debugLog('Error closing page: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
      });
    }
  }
}

export async function getCachedWaitlist(flightNumber: string, flightDate: string) {
  if (!flightNumber || !flightDate) {
    throw new Error('Missing required fields.');
  }

  try {
    return await db.getLatestWaitlistData(flightNumber, flightDate);
  } catch (error) {
    debugLog('Error getting cached waitlist: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
} 