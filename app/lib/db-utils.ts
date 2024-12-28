import db from './db';
import { debugLog } from './server-utils';
import fs from 'fs';
import path from 'path';

export async function showDatabaseInfo() {
  await db.initDb();
  const data = await db.getAllData();
  
  if (data) {
    debugLog('\n=== Flights Table ===');
    console.table(data.flights);
    
    debugLog('\n=== Waitlist Snapshots Table ===');
    console.table(data.snapshots.map(snapshot => ({
      ...snapshot,
      waitlist_names: JSON.parse(snapshot.waitlist_names)
    })));
  }
}

export async function clearDatabase() {
  await db.initDb();
  if (!db.isDbAvailable || !db.db) return;
  
  debugLog('Clearing all data...');
  await db.db.exec(`
    DELETE FROM waitlist_snapshots;
    DELETE FROM flights;
    VACUUM;
  `);
  debugLog('Database cleared!');
}

export async function resetDatabase() {
  const dbPath = path.join(process.cwd(), 'alaska_waitlist.db');
  
  // Close existing connection if any
  if (db.db) {
    await db.db.close();
  }
  
  // Delete the database file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    debugLog('Deleted existing database file');
  }
  
  // Reinitialize database
  await db.initDb();
  debugLog('Database reset complete!');
}

export async function getDatabaseStats() {
  await db.initDb();
  if (!db.isDbAvailable || !db.db) return;

  const stats = await db.getAllData();
  if (!stats) return;

  const { flights, snapshots } = stats;

  debugLog('\n=== Database Statistics ===');
  debugLog(`Total Flights Tracked: ${flights.length}`);
  debugLog(`Total Snapshots: ${snapshots.length}`);
  debugLog(`Unique Flight Numbers: ${new Set(flights.map(f => f.flight_number)).size}`);
  debugLog(`Date Range: ${flights[0]?.flight_date} to ${flights[flights.length - 1]?.flight_date}`);
}

// Export commands for CLI usage
export const commands = {
  show: showDatabaseInfo,
  clear: clearDatabase,
  reset: resetDatabase,
  stats: getDatabaseStats
};