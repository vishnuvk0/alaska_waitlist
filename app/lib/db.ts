import sqlite3 from 'sqlite3';
import { Database as SQLiteDatabase, open } from 'sqlite';
import path from 'path';
import { debugLog } from './server-utils';

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

export interface DatabaseRecord {
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  segment_index: number;
  waitlist_names: string;
  first_class_capacity: number | null;
  first_class_available: number | null;
  first_class_checked_in: number | null;
  snapshot_time: string;
}

class Database {
  private db: SQLiteDatabase<sqlite3.Database, sqlite3.Statement> | null = null;
  public isDbAvailable = false;

  async initDb(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), 'alaska_waitlist.db');
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
      
      await this.createTables();
      this.isDbAvailable = true;
      debugLog('Database initialized successfully at: ' + dbPath);
    } catch (error) {
      debugLog('Database connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      this.isDbAvailable = false;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;
    
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS flights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_number TEXT NOT NULL,
        flight_date TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_time TEXT,
        arrival_time TEXT,
        segment_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(flight_number, flight_date, segment_index)
      );

      CREATE TABLE IF NOT EXISTS waitlist_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_id INTEGER REFERENCES flights(id),
        waitlist_names TEXT,
        first_class_capacity INTEGER,
        first_class_available INTEGER,
        first_class_checked_in INTEGER,
        snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async saveFlightSegment(segment: FlightSegment, segmentIndex: number): Promise<number | null> {
    if (!this.isDbAvailable || !this.db) return null;
    
    try {
      const result = await this.db.run(`
        INSERT OR REPLACE INTO flights 
        (flight_number, flight_date, origin, destination, departure_time, arrival_time, segment_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          segment.flightNumber,
          segment.date,
          segment.origin,
          segment.destination,
          segment.departureTime,
          segment.arrivalTime,
          segmentIndex
        ]
      );
      return result.lastID || null;
    } catch (error) {
      debugLog('Error saving flight segment: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return null;
    }
  }

  async saveWaitlistSnapshot(flightId: number, waitlistInfo: WaitlistSnapshot): Promise<void> {
    if (!this.isDbAvailable || !this.db || !flightId) return;
    
    try {
      await this.db.run(`
        INSERT INTO waitlist_snapshots 
        (flight_id, waitlist_names, first_class_capacity, first_class_available, first_class_checked_in)
        VALUES (?, ?, ?, ?, ?)`,
        [
          flightId,
          JSON.stringify(waitlistInfo.names),
          waitlistInfo.capacity,
          waitlistInfo.available,
          waitlistInfo.checkedIn
        ]
      );
    } catch (error) {
      debugLog('Error saving waitlist snapshot: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async getLatestWaitlistData(flightNumber: string, flightDate: string): Promise<DatabaseRecord[] | null> {
    if (!this.isDbAvailable || !this.db) return null;
    
    try {
      return await this.db.all<DatabaseRecord[]>(`
        WITH LatestSnapshots AS (
          SELECT 
            w.*,
            f.flight_number,
            f.flight_date,
            f.origin,
            f.destination,
            f.departure_time,
            f.arrival_time,
            f.segment_index,
            ROW_NUMBER() OVER (
              PARTITION BY f.id 
              ORDER BY w.snapshot_time DESC
            ) as rn
          FROM flights f
          LEFT JOIN waitlist_snapshots w ON f.id = w.flight_id
          WHERE f.flight_number = ? AND f.flight_date = ?
        )
        SELECT * FROM LatestSnapshots 
        WHERE rn = 1
        ORDER BY segment_index
      `, [flightNumber, flightDate]);
    } catch (error) {
      debugLog('Error getting latest waitlist data: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return null;
    }
  }

  async getAllData(): Promise<{ flights: any[]; snapshots: any[] } | null> {
    if (!this.isDbAvailable || !this.db) return null;
    
    try {
      const flights = await this.db.all(`
        SELECT * FROM flights 
        ORDER BY flight_date DESC, flight_number, segment_index
      `);
      
      const snapshots = await this.db.all(`
        SELECT 
          w.*,
          f.flight_number,
          f.flight_date,
          f.segment_index
        FROM waitlist_snapshots w
        JOIN flights f ON w.flight_id = f.id
        ORDER BY w.snapshot_time DESC
      `);
      
      return { flights, snapshots };
    } catch (error) {
      debugLog('Error getting all data: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return null;
    }
  }
}

const db = new Database();
await db.initDb();

export default db; 