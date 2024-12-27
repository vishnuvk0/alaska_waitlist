import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

class Database {
  constructor() {
    this.db = null;
    this.isDbAvailable = false;
  }

  async initDb() {
    try {
      this.db = await open({
        filename: './alaska_waitlist.db',
        driver: sqlite3.Database
      });
      
      await this.createTables();
      this.isDbAvailable = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.warn('Database connection failed:', error.message);
      this.isDbAvailable = false;
    }
  }

  async createTables() {
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

  async saveFlightSegment(segment, segmentIndex) {
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
      return result.lastID;
    } catch (error) {
      console.error('Error saving flight segment:', error);
      return null;
    }
  }

  async saveWaitlistSnapshot(flightId, waitlistInfo) {
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
      console.error('Error saving waitlist snapshot:', error);
    }
  }

  async getLatestWaitlistData(flightNumber, flightDate) {
    if (!this.isDbAvailable || !this.db) return null;
    
    try {
      return await this.db.all(`
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
      console.error('Error getting latest waitlist data:', error);
      return null;
    }
  }

  async getAllData() {
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
      console.error('Error getting all data:', error);
      return null;
    }
  }
}

const database = new Database();
export default database; 