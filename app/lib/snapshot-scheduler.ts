import { Database, db } from './db';
import { debugLog } from './server-utils';
import { trackEliteStatus } from './elite-status-tracker';
import { trackWaitlist } from './waitlist';

const SNAPSHOT_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

let schedulerInterval: NodeJS.Timeout | null = null;

export async function startSnapshotScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Initial run
  await takeSnapshot();

  // Schedule subsequent runs
  schedulerInterval = setInterval(async () => {
    await takeSnapshot();
  }, SNAPSHOT_INTERVAL);

  debugLog('Snapshot scheduler started - will take snapshots every 4 hours');
}

export function stopSnapshotScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    debugLog('Snapshot scheduler stopped');
  }
}

async function takeSnapshot(): Promise<void> {
  try {
    debugLog('Starting scheduled waitlist snapshot...');

    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Get all flights in the next 2 days
    const flights = await db.db?.all(`
      SELECT DISTINCT 
        flight_number,
        flight_date
      FROM flights
      WHERE flight_date BETWEEN ? AND ?
      ORDER BY flight_date, flight_number
    `, [
      now.toISOString().split('T')[0],
      twoDaysFromNow.toISOString().split('T')[0]
    ]) || [];

    debugLog(`Found ${flights.length} flights to snapshot in the next 2 days`);

    // Take snapshots for each flight
    for (const flight of flights) {
      try {
        // Use an empty string as the username since we want to capture the entire waitlist
        await trackWaitlist(flight.flight_number, flight.flight_date, '', true);
        debugLog(`Took snapshot for flight ${flight.flight_number} on ${flight.flight_date}`);
      } catch (error) {
        debugLog(`Error taking snapshot for flight ${flight.flight_number} on ${flight.flight_date}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Process elite status for all snapshots
    await trackEliteStatus(db);
    
    debugLog('Completed scheduled waitlist snapshot and elite status tracking');
  } catch (error) {
    debugLog('Error during scheduled snapshot: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
} 