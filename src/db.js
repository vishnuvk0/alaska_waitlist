import pg from 'pg';
const { Pool } = pg;

let pool = null;
let isDbAvailable = false;

const initDb = async () => {
  try {
    pool = new Pool({
      user: 'admin',
      host: 'localhost',
      database: 'alaska_waitlist',
      password: 'password',
      port: 5432,
    });

    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    // If we get here, connection was successful
    isDbAvailable = true;
    
    // Create tables
    await createTables();
    console.log('Database initialized successfully');
  } catch (error) {
    console.warn('Database connection failed:', error.message);
    console.warn('Running without database persistence');
    isDbAvailable = false;
  }
};

const createTables = async () => {
  if (!isDbAvailable) return;
  
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS flights (
        id SERIAL PRIMARY KEY,
        flight_number VARCHAR(10) NOT NULL,
        flight_date DATE NOT NULL,
        departure_time TIME,
        origin VARCHAR(5),
        destination VARCHAR(5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(flight_number, flight_date)
      );

      CREATE TABLE IF NOT EXISTS waitlist_snapshots (
        id SERIAL PRIMARY KEY,
        flight_id INTEGER REFERENCES flights(id),
        waitlist_names TEXT[],
        first_class_capacity INTEGER,
        first_class_available INTEGER,
        first_class_checked_in INTEGER,
        snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
};

export const saveFlightInfo = async (flightNumber, flightDate, departureTime, origin, destination) => {
  if (!isDbAvailable) return null;
  
  try {
    const result = await pool.query(
      `INSERT INTO flights (flight_number, flight_date, departure_time, origin, destination)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (flight_number, flight_date) 
       DO UPDATE SET 
         departure_time = EXCLUDED.departure_time,
         origin = EXCLUDED.origin,
         destination = EXCLUDED.destination
       RETURNING id`,
      [flightNumber, flightDate, departureTime, origin, destination]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving flight info:', error);
    return null;
  }
};

export const saveWaitlistSnapshot = async (flightId, waitlistNames, waitlistInfo) => {
  if (!isDbAvailable || !flightId) return;
  
  try {
    await pool.query(
      `INSERT INTO waitlist_snapshots 
       (flight_id, waitlist_names, first_class_capacity, first_class_available, first_class_checked_in)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        flightId,
        waitlistNames,
        waitlistInfo.capacity,
        waitlistInfo.available,
        waitlistInfo.checkedIn
      ]
    );
  } catch (error) {
    console.error('Error saving waitlist snapshot:', error);
  }
};

export default {
  initDb,
  saveFlightInfo,
  saveWaitlistSnapshot,
  isDbAvailable
}; 