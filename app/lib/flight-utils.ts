import { debugLog } from './server-utils';
import { CheerioAPI } from 'cheerio';

export interface FlightSegment {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
}

export interface WaitlistSnapshot {
  names: string[];
  capacity: number | null;
  available: number | null;
  checkedIn: number | null;
}

export function parseFlightSegments($: CheerioAPI): FlightSegment[] {
  debugLog('\n=== Parsing Flight Segments ===');
  const segments: FlightSegment[] = [];
  
  // Get all airport pairs from the status container first
  const $statusContainer = $('.primary-status');
  const airportPairs: { origin: string; destination: string }[] = [];
  
  if ($statusContainer.length) {
    // First segment is from the first callout to the first callout-arrival
    const firstOrigin = $statusContainer.find('.callout airport-helper').first().attr('iata') || '';
    const firstDestination = $statusContainer.find('.callout-arrival airport-helper').first().attr('iata') || '';
    airportPairs.push({ origin: firstOrigin, destination: firstDestination });
    
    // Second segment is from the second callout to the last callout
    const secondOrigin = $statusContainer.find('.callout-arrival airport-helper').first().attr('iata') || '';
    const secondDestination = $statusContainer.find('.callout airport-helper').last().attr('iata') || '';
    airportPairs.push({ origin: secondOrigin, destination: secondDestination });
  }
  
  const mainRows = $('.main-row-status');
  debugLog(`Found ${mainRows.length} main-row-status elements`);
  
  mainRows.each((i, container) => {
    const $container = $(container);
    const $flight = $container.find('auro-flight');
    
    if ($flight.length) {
      debugLog(`\nAnalyzing flight element ${i + 1}:`);
      
      // Get flight details
      const flightNumber = $flight.attr('flights')?.replace('AS ', '') || '';
      
      // Get departure and arrival times from the span elements
      const departureTime = $flight.find('span[slot="departureHeader"]').text().replace('Scheduled', '').trim();
      const arrivalTime = $flight.find('span[slot="arrivalHeader"]').text().replace('Scheduled', '').trim();
      
      // Get airports from our pre-collected pairs
      const airportPair = airportPairs[i] || { origin: '', destination: '' };
      let { origin, destination } = airportPair;
      
      // Fallback to flight attributes if needed
      if (!origin) origin = $flight.attr('departurestation') || '';
      if (!destination) destination = $flight.attr('arrivalstation') || '';
      
      // Get the date from the timestamp element
      const date = $('.timestamp').first().text().trim();

      debugLog(`Parsing flight ${i + 1}:
        Flight: AS${flightNumber}
        Route: ${origin} → ${destination}
        Times: ${departureTime} → ${arrivalTime}`);
      
      if (flightNumber && date) {
        const segment: FlightSegment = {
          flightNumber,
          date,
          origin,
          destination,
          departureTime,
          arrivalTime
        };
        segments.push(segment);
      }
    }
  });

  debugLog(`Total segments found: ${segments.length}`);
  return segments;
}

export function parseWaitlistForSegment($: CheerioAPI, segmentIndex: number): WaitlistSnapshot | null {
  debugLog(`\n=== Parsing Waitlist for Segment ${segmentIndex + 1} ===`);
  
  // Get all accordions
  const accordions = $('.accordion-container-fs');
  debugLog(`Found ${accordions.length} accordion sections`);
  
  const accordion = accordions.eq(segmentIndex);
  if (!accordion.length) {
    debugLog('❌ No accordion found for this segment');
    return null;
  }

  // First try to find the specific upgrade requests container
  const upgradeContainers = accordion.find('.waitlist-single-container').filter((_, container) => {
    const headerText = $(container).find('h4').text().trim();
    debugLog(`Found container with header: "${headerText}"`);
    return headerText === 'Upgrade requests';
  });

  debugLog(`Found ${upgradeContainers.length} specific upgrade containers`);

  const waitlistInfo: WaitlistSnapshot = {
    names: [],
    capacity: null,
    available: null,
    checkedIn: null
  };

  if (upgradeContainers.length) {
    const container = upgradeContainers.first();
    debugLog('\nProcessing upgrade container...');

    // Parse capacity info
    container.find('.waitlist-text-container span').each((_, span) => {
      const text = $(span).text().trim();
      debugLog(`Analyzing capacity text: "${text}"`);
      
      if (text.includes('capacity')) {
        waitlistInfo.capacity = parseInt(text.match(/\d+/)?.[0] || '0');
      } else if (text.includes('Available')) {
        waitlistInfo.available = parseInt(text.match(/\d+/)?.[0] || '0');
      } else if (text.includes('Checked-in')) {
        waitlistInfo.checkedIn = parseInt(text.match(/\d+/)?.[0] || '0');
      }
    });

    // Parse names from the table
    const rows = container.find('table.auro_table tbody tr');
    debugLog(`Found ${rows.length} name rows in table`);
    
    rows.each((_, row) => {
      const nameCell = $(row).find('td').eq(1);
      const name = nameCell.text().trim();
      if (name) {  // Remove the regex test to allow all names
        debugLog(`Found name: ${name}`);
        waitlistInfo.names.push(name);
      }
    });
  }

  debugLog('\nFinal waitlist info: ' + JSON.stringify(waitlistInfo));
  return waitlistInfo;
}

export function parseFlightNumber(input: string): string {
  const match = input.match(/\d+/);
  return match ? match[0] : '';
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function isValidFlightNumber(flightNumber: string): boolean {
  return /^\d{1,5}$/.test(flightNumber);
}

export function isValidDate(date: string): boolean {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

export function validateFlightInput(flightNumber: string, date: string): string | null {
  if (!flightNumber || !date) {
    return 'Flight number and date are required';
  }

  if (!isValidFlightNumber(flightNumber)) {
    return 'Invalid flight number format';
  }

  if (!isValidDate(date)) {
    return 'Invalid date format';
  }

  const inputDate = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 3);

  if (inputDate < yesterday) {
    return 'Date cannot be more than 1 day in the past';
  }

  if (inputDate > maxDate) {
    return 'Date is too far in the future';
  }

  return null;
} 