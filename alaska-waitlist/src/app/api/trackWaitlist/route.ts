import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

let browser: any = null;

// Initialize browser on first request
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
  }
  return browser;
}

// Helper functions from your server.js
function parseWaitlistNames(html: string) {
  const $ = cheerio.load(html);
  const names: string[] = [];

  $('.waitlist-single-container').each((_, container) => {
    const header = $(container).find('h4').text().trim();
    if (header === 'Upgrade requests') {
      const rows = $(container).find('tbody.svelte-1qyfggt tr');
      rows.each((_, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const guestName = $(tds[1]).text().trim();
          if (guestName) {
            names.push(guestName);
          }
        }
      });
    }
  });

  return names;
}

function fuzzyMatch(userName: string, candidate: string) {
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

export async function POST(request: Request) {
  const { flightNumber, flightDate, userName } = await request.json();

  if (!flightNumber || !flightDate || !userName) {
    return NextResponse.json(
      { error: 'Missing required fields.' },
      { status: 400 }
    );
  }

  let page;
  try {
    const browser = await initBrowser();
    page = await browser.newPage();
    
    // ... rest of your scraping logic from server.js ...
    
    const waitlistInfo = { firstClassSeatsAvailable: 0 }; // Adjust the structure based on your needs
    
    // Return the results
    return NextResponse.json({
      message: userMessage,
      userMatchScore: bestMatchScore,
      waitlistOrder: newWaitlist,
      newNames,
      droppedNames,
      waitlistInfo
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Error scraping waitlist: ' + error.message },
      { status: 500 }
    );
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
} 