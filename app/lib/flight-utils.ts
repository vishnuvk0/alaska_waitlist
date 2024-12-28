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
  
  const mainRows = $('.main-row-status');
  debugLog(`Found ${mainRows.length} main-row-status elements`);
  
  mainRows.each((i, container) => {
    const $container = $(container);
    const $flight = $container.find('auro-flight');
    
    if ($flight.length) {
      debugLog(`\nAnalyzing flight element ${i + 1}:`);
      
      // Get flight details with multiple fallbacks
      let flightNumber = '';
      let origin = '';
      let destination = '';
      let departureTime = '';
      let arrivalTime = '';
      
      // Try auro-flight attributes first
      if ($flight.length) {
        flightNumber = $flight.attr('flights')?.replace('AS ', '') || '';
        origin = $flight.attr('departurestation') || '';
        destination = $flight.attr('arrivalstation') || '';
        departureTime = $flight.attr('departuretime')?.split(' ')[1] || '';
        arrivalTime = $flight.attr('arrivaltime')?.split(' ')[1] || '';
      }
      
      // If any values are missing, try JSON-LD
      try {
        const jsonLdScript = $('script[type="application/ld+json"]').first().html();
        if (jsonLdScript) {
          const flightData = JSON.parse(jsonLdScript);
          if (!origin) origin = flightData.departureAirport;
          if (!destination) destination = flightData.arrivalAirport;
          if (!departureTime) departureTime = new Date(flightData.departureTime).toLocaleTimeString();
          if (!arrivalTime) arrivalTime = new Date(flightData.arrivalTime).toLocaleTimeString();
        }
      } catch (e) {
        debugLog('Failed to parse JSON-LD: ' + e);
      }
      
      // Try meta tags as another fallback
      if (!origin) origin = $('meta[name="origin"]').attr('content') || '';
      if (!destination) destination = $('meta[name="destination"]').attr('content') || '';
      
      // Get the date from the timestamp element
      const date = $('.timestamp').first().text().trim();
      
      debugLog('Parsed flight details: ' + JSON.stringify({
        flightNumber,
        origin,
        destination,
        departureTime,
        arrivalTime,
        date
      }));

      if (flightNumber && date) {
        const segment: FlightSegment = {
          flightNumber,
          date,
          origin,
          destination,
          departureTime,
          arrivalTime
        };
        
        debugLog(`Created segment:
          Flight: AS${segment.flightNumber}
          Date: ${segment.date}
          Route: ${segment.origin} → ${segment.destination}
          Departure: ${segment.departureTime}
          Arrival: ${segment.arrivalTime}`);
        
        segments.push(segment);
      } else {
        debugLog('Skipping segment due to missing data: ' + JSON.stringify({
          flightNumber,
          date,
          origin,
          destination
        }));
      }
    }
  });

  debugLog(`\nTotal segments found: ${segments.length}`);
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
    return $(container).find('h4').text().trim() === 'Upgrade requests';
  });

  debugLog(`Found ${upgradeContainers.length} specific upgrade containers`);

  const waitlistInfo: WaitlistSnapshot = {
    capacity: null,
    available: null,
    checkedIn: null,
    names: []
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
      if (name && /^[A-Z]{2,3}\/[A-Z]$/.test(name)) {
        debugLog(`✓ Found valid name: ${name}`);
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
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 330); // Alaska Airlines allows booking ~330 days in advance

  if (inputDate < today) {
    return 'Date cannot be in the past';
  }

  if (inputDate > maxDate) {
    return 'Date is too far in the future';
  }

  return null;
} 