import type Database from './db';

interface FlightRecord {
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  segment_index: number;
  created_at: string;
}

interface SnapshotRecord {
  flight_number: string;
  flight_date: string;
  segment_index: number;
  waitlist_names: string;
  first_class_capacity: number | null;
  first_class_available: number | null;
  first_class_checked_in: number | null;
  snapshot_time: string;
}

export function debugLog(message: string, level: 'info' | 'error' | 'debug' = 'debug'): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

export function serializeError(error: unknown): { message: string; status?: number } {
  if (error instanceof Error) {
    return {
      message: error.message,
      status: (error as any).status || 500
    };
  }
  
  if (typeof error === 'string') {
    return { message: error };
  }
  
  return { message: 'An unknown error occurred' };
}

export async function fetchWithTimeout(
  resource: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 8000, ...fetchOptions } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
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

export async function logDatabaseState(db: typeof Database): Promise<void> {
  try {
    debugLog('\n======');
    
    const data = await db.getAllData();
    if (!data) {
      debugLog('No data available from database');
      return;
    }

    // // Log flights
    // debugLog('\nFlights Table:');
    // data.flights.forEach((flight: FlightRecord) => {
    //   debugLog(`Flight AS${flight.flight_number} on ${new Date(flight.flight_date).toLocaleDateString()}:
    //     Segment ${flight.segment_index + 1}
    //     Route: ${flight.origin} → ${flight.destination}
    //     Times: ${flight.departure_time} → ${flight.arrival_time}
    //     Created: ${new Date(flight.created_at).toLocaleString()}`);
    // });

    // // Log snapshots
    // debugLog('\nWaitlist Snapshots Table:');
    // data.snapshots.forEach((snapshot: SnapshotRecord) => {
    //   const names = JSON.parse(snapshot.waitlist_names || '[]');
    //   debugLog(`Snapshot for AS${snapshot.flight_number} on ${new Date(snapshot.flight_date).toLocaleDateString()}:
    //     Segment ${snapshot.segment_index + 1}
    //     Names: ${names.join(', ')}
    //     First Class:
    //       Capacity: ${snapshot.first_class_capacity}
    //       Available: ${snapshot.first_class_available}
    //       Checked In: ${snapshot.first_class_checked_in}
    //     Time: ${new Date(snapshot.snapshot_time).toLocaleString()}`);
    // });

    // debugLog('\n=== End Database State ===\n');
  } catch (error) {
    debugLog('Error logging database state: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  }
}