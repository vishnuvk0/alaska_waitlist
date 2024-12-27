import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Database from './db';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 
 * In-memory store of waitlists keyed by flightNumber+flightDate:
 * {
 *   "3411|2024-12-29": {
 *       waitlist: ["KUM/V", "JIN/K", ...],
 *       timestamp: 1699999999
 *   },
 *   ...
 * }
 */
export const previousWaitlists: Record<string, { waitlist: string[], timestamp: number }> = {};

/** 
 * A super-simple fuzzy match. For each character in `userName`, count how many are in `candidate`.
 * Then return ratio (0..1). 
 */
export function fuzzyMatch(userName: string, candidate: string): number {
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

/** 
 * Compare old waitlist array vs. new waitlist array:
 * Returns { newNames: [], droppedNames: [] }
 */
export function compareWaitlists(oldList: string[], newList: string[]): { newNames: string[], droppedNames: string[] } {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  const newNames = newList.filter(n => !oldSet.has(n));
  const droppedNames = oldList.filter(n => !newSet.has(n));
  return { newNames, droppedNames };
}

export function debugLog(message: string, consoleOnly = false): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}`;
  
  // Always log to console
  console.log(logMessage);
}

export async function logDatabaseState(db: typeof Database): Promise<void> {
  try {
    debugLog('\n=== Current Database State ===');
    
    // Get all data using the public getAllData method instead
    const data = await db.getAllData();
    if (!data) {
      debugLog('No data available');
      return;
    }

    // Log flights
    debugLog('\nFlights Table:');
    console.table(data.flights);

    // Log snapshots
    debugLog('\nWaitlist Snapshots Table:');
    console.table(data.snapshots);
    
    debugLog('\n=== End Database State ===\n');
  } catch (error: any) {
    debugLog('Error logging database state: ' + error.message);
  }
} 