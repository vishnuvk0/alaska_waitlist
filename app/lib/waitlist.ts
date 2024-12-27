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
  error?: string;
}

export interface WaitlistResult {
  segments: WaitlistSegment[];
  error?: string;
}

async function getPageContent(page: Page): Promise<string> {
  try {
    return await page.content();
  } catch (error) {
    debugLog('Error getting page content: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return '';
  }
}

export async function trackWaitlist(
  flightNumber: string,
  flightDate: string,
  userName: string
): Promise<WaitlistResult> {
  let page: Page | undefined;
  
  try {
    page = await createPage();
    const url = `https://www.alaskaair.com/status/${flightNumber}/${flightDate}`;
    
    debugLog(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    if (await needsVerification(page)) {
      debugLog('Verification needed, attempting to handle...');
      const verificationSuccess = await handlePressAndHoldVerification(page);
      if (!verificationSuccess) {
        throw new Error('Failed to complete verification');
      }
      await page.waitForSelector('.waitlist-text-container', { timeout: 2000 }).catch(() => {});
    }

    const content = await getPageContent(page);
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

      // Get waitlist info for this segment
      const waitlistInfo = parseWaitlistForSegment($, i);
      
      // Save to database
      const flightId = await db.saveFlightSegment(segment, i);
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
      });
    }

    return {
      segments: processedSegments
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    debugLog('Error tracking waitlist: ' + errorMessage);
    
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
        debugLog('Error closing page: ' + (error instanceof Error ? error.message : 'Unknown error'));
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