import { Database, DatabaseRecord } from './db';
import { debugLog } from './server-utils';

export enum EliteStatus {
  MVP = 'MVP',
  MVP_GOLD = 'MVP_GOLD',
  MVP_GOLD_75K = 'MVP_GOLD_75K'
}

interface EliteStatusEntry {
  passenger: string;
  status: EliteStatus;
  addedTime: Date;
  flightNumber: string;
  flightDate: string;
  departureTime: string;
  origin: string;
}

interface WaitlistDiff {
  added: string[];
  removed: string[];
  reordered: {
    passenger: string;
    oldPosition: number;
    newPosition: number;
  }[];
}

const TIMEZONE_OFFSETS: { [key: string]: number } = {
  'SFO': -8, // UTC-8
  'LAX': -8,
  'SEA': -8,
  'PDX': -8,
  'JFK': -5, // UTC-5
  'BOS': -5,
  'MIA': -5,
  'ORD': -6, // UTC-6
  'DFW': -6,
  'DEN': -7, // UTC-7
  'PHX': -7,
  // Add more airports as needed
};

function getAirportTimezone(airportCode: string): number {
  return TIMEZONE_OFFSETS[airportCode] || -8; // Default to PST if unknown
}

function calculateHoursBeforeDeparture(departureTime: string, departureDate: string, origin: string): number {
  const tzOffset = getAirportTimezone(origin);
  const now = new Date();
  
  // Create departure datetime by combining date and time
  const [hours, minutes] = departureTime.split(':').map(Number);
  const departure = new Date(departureDate);
  departure.setHours(hours, minutes, 0, 0); // Set exact departure time
  
  // Adjust for timezone
  const localDeparture = new Date(departure.getTime() + (tzOffset * 60 * 60 * 1000));
  
  // Calculate hours difference
  return (localDeparture.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function determineEliteStatus(
  hoursBeforeDeparture: number,
  isNewAddition: boolean,
  position: number,
  previousStatuses: Map<string, EliteStatus>,
  waitlistNames: string[]
): EliteStatus {
  // Log the hours for debugging
  debugLog(`Hours before departure: ${hoursBeforeDeparture}`);

  // T-120 to T-72: MVP Gold 75K
  if (hoursBeforeDeparture >= 72) {
    return EliteStatus.MVP_GOLD_75K;
  }
  
  // T-72 to T-48: MVP Gold
  if (hoursBeforeDeparture >= 48) {
    return EliteStatus.MVP_GOLD;
  }
  
  // Less than T-48: MVP
  return EliteStatus.MVP;
}

function compareWaitlists(oldNames: string[], newNames: string[]): WaitlistDiff {
  const diff: WaitlistDiff = {
    added: [],
    removed: [],
    reordered: []
  };
  
  // Find added and removed names
  diff.added = newNames.filter(name => !oldNames.includes(name));
  diff.removed = oldNames.filter(name => !newNames.includes(name));
  
  // Find reordered names
  const commonNames = newNames.filter(name => oldNames.includes(name));
  for (const name of commonNames) {
    const oldPos = oldNames.indexOf(name);
    const newPos = newNames.indexOf(name);
    if (oldPos !== newPos) {
      diff.reordered.push({
        passenger: name,
        oldPosition: oldPos,
        newPosition: newPos
      });
    }
  }
  
  return diff;
}

export async function processWaitlistSnapshot(
  db: Database,
  flightNumber: string,
  flightDate: string,
  origin: string,
  departureTime: string,
  waitlistNames: string[],
  previousSnapshot: DatabaseRecord | null,
  previousStatuses: Map<string, EliteStatus>
): Promise<Map<string, EliteStatus>> {
  const newStatuses = new Map<string, EliteStatus>();
  const hoursBeforeDeparture = calculateHoursBeforeDeparture(departureTime, flightDate, origin);
  
  // If this is the first snapshot
  if (!previousSnapshot) {
    waitlistNames.forEach((passenger, position) => {
      const status = determineEliteStatus(
        hoursBeforeDeparture,
        true,
        position,
        previousStatuses,
        waitlistNames
      );
      newStatuses.set(passenger, status);
    });
    return newStatuses;
  }
  
  // Compare with previous snapshot
  const prevNames = JSON.parse(previousSnapshot.waitlist_names);
  const diff = compareWaitlists(prevNames, waitlistNames);
  
  // Process existing passengers
  waitlistNames.forEach((passenger, position) => {
    if (diff.added.includes(passenger)) {
      // New addition
      const status = determineEliteStatus(
        hoursBeforeDeparture,
        true,
        position,
        previousStatuses,
        waitlistNames
      );
      newStatuses.set(passenger, status);
    } else {
      // Existing passenger
      const status = determineEliteStatus(
        hoursBeforeDeparture,
        false,
        position,
        previousStatuses,
        waitlistNames
      );
      newStatuses.set(passenger, status);
    }
  });
  
  return newStatuses;
}

export async function trackEliteStatus(db: Database): Promise<void> {
  try {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    // Get all flights in the next 2 days
    const flights = await db.db?.all(`
      SELECT DISTINCT 
        f.flight_number,
        f.flight_date,
        f.origin,
        f.departure_time
      FROM flights f
      WHERE f.flight_date BETWEEN ? AND ?
      ORDER BY f.flight_date, f.flight_number
    `, [
      now.toISOString().split('T')[0],
      twoDaysFromNow.toISOString().split('T')[0]
    ]) || [];
    
    for (const flight of flights) {
      // Get the latest snapshot for this flight
      const latestSnapshot = await db.getLatestWaitlistData(
        flight.flight_number,
        flight.flight_date
      );
      
      if (!latestSnapshot || !latestSnapshot[0]) continue;
      
      const snapshot = latestSnapshot[0];
      const waitlistNames = JSON.parse(snapshot.waitlist_names);
      
      // Get previous snapshot if exists
      const previousSnapshot = await db.db?.get<DatabaseRecord>(`
        SELECT *
        FROM waitlist_snapshots
        WHERE flight_id = ? AND snapshot_time < ?
        ORDER BY snapshot_time DESC
        LIMIT 1
      `, [snapshot.flight_id, snapshot.snapshot_time]);
      
      // Get previous statuses
      const previousStatuses = new Map<string, EliteStatus>();
      const prevStatusRows = await db.db?.all(`
        SELECT passenger, status
        FROM elite_status
        WHERE flight_number = ? AND flight_date = ?
        ORDER BY added_time DESC
      `, [flight.flight_number, flight.flight_date]) || [];
      
      // Use the most recent status for each passenger
      for (const row of prevStatusRows) {
        if (!previousStatuses.has(row.passenger)) {
          previousStatuses.set(row.passenger, row.status as EliteStatus);
        }
      }
      
      // Process the snapshot
      const newStatuses = await processWaitlistSnapshot(
        db,
        flight.flight_number,
        flight.flight_date,
        flight.origin,
        flight.departure_time,
        waitlistNames,
        previousSnapshot || null,
        previousStatuses
      );
      
      // Save the new statuses
      for (const [passenger, status] of newStatuses.entries()) {
        await db.db?.run(`
          INSERT OR REPLACE INTO elite_status
          (passenger, status, flight_number, flight_date, added_time)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [passenger, status, flight.flight_number, flight.flight_date]);
      }
      
      debugLog(`Processed elite status for flight ${flight.flight_number} on ${flight.flight_date}`);
    }
  } catch (error) {
    debugLog('Error tracking elite status: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
} 