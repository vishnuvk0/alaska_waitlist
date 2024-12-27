import type Database from './db';

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export function debugLog(message: string, consoleOnly = false): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}`;
  
  // Always log to console
  console.log(logMessage);
}

interface DatabaseInstance {
  isDbAvailable: boolean;
  getAllData(): Promise<{ flights: any[]; snapshots: any[] } | null>;
}

export async function logDatabaseState(db: DatabaseInstance): Promise<void> {
  try {
    debugLog('\n=== Current Database State ===');
    
    if (!db.isDbAvailable) {
      debugLog('Database is not available');
      return;
    }

    // Get all data from database
    const data = await db.getAllData();
    if (!data) {
      debugLog('No data available from database');
      return;
    }

    // Log flights
    debugLog('\nFlights Table:');
    data.flights.forEach(flight => {
      debugLog(`Flight AS${flight.flight_number} on ${flight.flight_date}:
        Segment ${flight.segment_index + 1}
        Route: ${flight.origin} → ${flight.destination}
        Times: ${flight.departure_time} → ${flight.arrival_time}
        Created: ${flight.created_at}`);
    });

    // Log snapshots
    debugLog('\nWaitlist Snapshots Table:');
    data.snapshots.forEach(snapshot => {
      const names = JSON.parse(snapshot.waitlist_names || '[]');
      debugLog(`Snapshot for AS${snapshot.flight_number} on ${snapshot.flight_date}:
        Segment ${snapshot.segment_index + 1}
        Names: ${names.join(', ')}
        First Class:
          Capacity: ${snapshot.first_class_capacity ?? 'Unknown'}
          Available: ${snapshot.first_class_available ?? 'Unknown'}
          Checked In: ${snapshot.first_class_checked_in ?? 'Unknown'}
        Time: ${snapshot.snapshot_time}`);
    });
    
    debugLog('\n=== End Database State ===\n');
  } catch (error) {
    debugLog('Error logging database state: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
} 