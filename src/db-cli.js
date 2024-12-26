import db from './db.js';

async function queryDatabase() {
  await db.initDb();
  
  try {
    // Get all flights
    const flights = await db.query('SELECT * FROM flights');
    console.log('\nFlights:');
    console.table(flights);

    // Get all waitlist snapshots
    const waitlists = await db.query('SELECT * FROM waitlist_snapshots');
    console.log('\nWaitlist Snapshots:');
    console.table(waitlists);

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await db.close();
  }
}

queryDatabase();