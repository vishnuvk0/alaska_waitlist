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
  id?: number;
  flight_id?: number;
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

export interface FlightRecord {
  id: number;
  flight_number: string;
  flight_date: string;
  origin: string;
  departure_time: string;
}

export class Database {
  public db: SQLiteDatabase<sqlite3.Database, sqlite3.Statement> | null = null;
  public isDbAvailable = false;
  private initPromise: Promise<void> | null = null;

  async initDb(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        if (this.isDbAvailable && this.db) {
          resolve();
          return;
        }

        const dbPath = path.join(process.cwd(), 'alaska_waitlist.db');
        this.db = await open({
          filename: dbPath,
          driver: sqlite3.Database
        });
        
        await this.createTables();
        this.isDbAvailable = true;
        debugLog('Database initialized successfully at: ' + dbPath);
        resolve();
      } catch (error) {
        debugLog('Database connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        this.isDbAvailable = false;
        this.db = null;
        this.initPromise = null;
        reject(error);
      }
    });

    return this.initPromise;
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
        departure_time TEXT NOT NULL,
        arrival_time TEXT NOT NULL,
        segment_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(flight_number, flight_date, segment_index)
      );

      CREATE TABLE IF NOT EXISTS waitlist_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_id INTEGER REFERENCES flights(id),
        waitlist_names TEXT NOT NULL,
        first_class_capacity INTEGER,
        first_class_available INTEGER,
        first_class_checked_in INTEGER,
        snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS elite_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        passenger TEXT NOT NULL,
        status TEXT NOT NULL,
        flight_number TEXT NOT NULL,
        flight_date TEXT NOT NULL,
        added_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(passenger, flight_number, flight_date)
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        status_level TEXT NOT NULL CHECK (status_level IN ('MVP', 'MVP_GOLD', 'MVP_GOLD_75K')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_flights_lookup ON flights(flight_number, flight_date);
      CREATE INDEX IF NOT EXISTS idx_snapshots_flight ON waitlist_snapshots(flight_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_time ON waitlist_snapshots(snapshot_time);
      CREATE INDEX IF NOT EXISTS idx_elite_status_flight ON elite_status(flight_number, flight_date);
      CREATE INDEX IF NOT EXISTS idx_elite_status_passenger ON elite_status(passenger);
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

  async getLatestWaitlistData(flightNumber: string, flightDate: string): Promise<DatabaseRecord[]> {
    if (!this.isDbAvailable || !this.db) return [];
    
    try {
      const result = await this.db.all(`
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
      `, [flightNumber, flightDate]) as DatabaseRecord[];
      
      return result;
    } catch (error) {
      debugLog('Error getting latest waitlist data: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return [];
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

export const db = new Database();

// Initialize the database when the module is loaded
db.initDb().catch(error => {
  console.error('Failed to initialize database:', error);
});

export default db; 