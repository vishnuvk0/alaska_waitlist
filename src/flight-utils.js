/**
 * Represents a flight segment with origin, destination, and timing information
 */
class FlightSegment {
  constructor(flightNumber, date, origin, destination, departureTime, arrivalTime) {
    this.flightNumber = flightNumber;
    this.date = date;
    this.origin = origin;
    this.destination = destination;
    this.departureTime = departureTime;
    this.arrivalTime = arrivalTime;
  }
}

/**
 * Parse flight segments from the HTML content
 */
export function parseFlightSegments($) {
  console.log('\n=== Parsing Flight Segments ===');
  const segments = [];
  
  const mainRows = $('.main-row-status');
  console.log(`Found ${mainRows.length} main-row-status elements`);
  
  mainRows.each((i, container) => {
    const $container = $(container);
    const $flight = $container.find('auro-flight');
    
    if ($flight.length) {
      console.log(`\nAnalyzing flight element ${i + 1}:`);
      
      // Get flight details from attributes
      const flightNumber = $flight.attr('flights')?.replace('AS ', '');
      const origin = $flight.attr('departurestation');
      const destination = $flight.attr('arrivalstation');
      const departureTime = $flight.attr('departuretime')?.split(' ')[1];
      const arrivalTime = $flight.attr('arrivaltime')?.split(' ')[1];
      
      // Get the date from the timestamp element
      const date = $('.timestamp').first().text().trim();
      
      console.log('Parsed flight details:', {
        flightNumber,
        origin,
        destination,
        departureTime,
        arrivalTime,
        date
      });

      if (flightNumber && date) {
        const segment = new FlightSegment(
          flightNumber,
          date,
          origin || 'Unknown',
          destination || 'Unknown',
          departureTime || 'Unknown',
          arrivalTime || 'Unknown'
        );
        
        console.log(`Created segment:
          Flight: AS${segment.flightNumber}
          Date: ${segment.date}
          Route: ${segment.origin} → ${segment.destination}
          Departure: ${segment.departureTime}
          Arrival: ${segment.arrivalTime}`);
        
        segments.push(segment);
      } else {
        console.warn('Skipping segment due to missing data:', {
          flightNumber,
          date,
          origin,
          destination
        });
      }
    }
  });

  console.log(`\nTotal segments found: ${segments.length}`);
  return segments;
}

/**
 * Parse waitlist information for a specific segment using the thorough approach
 */
export function parseWaitlistForSegment($, segmentIndex) {
  console.log(`\n=== Parsing Waitlist for Segment ${segmentIndex + 1} ===`);
  
  // Get all accordions
  const accordions = $('.accordion-container-fs');
  console.log(`Found ${accordions.length} accordion sections`);
  
  const accordion = accordions.eq(segmentIndex);
  if (!accordion.length) {
    console.log('❌ No accordion found for this segment');
    return null;
  }

  // First try to find the specific upgrade requests container
  const upgradeContainers = accordion.find('.waitlist-single-container').filter((_, container) => {
    return $(container).find('h4').text().trim() === 'Upgrade requests';
  });

  console.log(`Found ${upgradeContainers.length} specific upgrade containers`);

  const waitlistInfo = {
    capacity: null,
    available: null,
    checkedIn: null,
    names: []
  };

  if (upgradeContainers.length) {
    const container = upgradeContainers.first();
    console.log('\nProcessing upgrade container...');

    // Parse capacity info
    container.find('.waitlist-text-container span').each((_, span) => {
      const text = $(span).text().trim();
      console.log(`Analyzing capacity text: "${text}"`);
      
      if (text.includes('capacity')) {
        waitlistInfo.capacity = parseInt(text.match(/\d+/)[0]);
      } else if (text.includes('Available')) {
        waitlistInfo.available = parseInt(text.match(/\d+/)[0]);
      } else if (text.includes('Checked-in')) {
        waitlistInfo.checkedIn = parseInt(text.match(/\d+/)[0]);
      }
    });

    // Parse names from the table
    const rows = container.find('table.auro_table tbody tr');
    console.log(`Found ${rows.length} name rows in table`);
    
    rows.each((_, row) => {
      const nameCell = $(row).find('td').eq(1);
      const name = nameCell.text().trim();
      if (name && /^[A-Z]{2,3}\/[A-Z]$/.test(name)) {
        console.log(`✓ Found valid name: ${name}`);
        waitlistInfo.names.push(name);
      }
    });
  }

  console.log('\nFinal waitlist info:', waitlistInfo);
  return waitlistInfo;
}