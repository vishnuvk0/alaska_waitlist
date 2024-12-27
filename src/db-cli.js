import db from './db.js';

const commands = {
  init: async () => {
    console.log('Initializing database...');
    await db.initDb();
    console.log('Database initialized!');
  },

  show: async () => {
    await db.initDb();
    const data = await db.getAllData();
    
    if (data) {
      console.log('\n=== Flights Table ===');
      console.table(data.flights);
      
      console.log('\n=== Waitlist Snapshots Table ===');
      console.table(data.snapshots);
    }
  },

  clear: async () => {
    await db.initDb();
    if (!db.db) return;
    
    console.log('Clearing all data...');
    await db.db.exec(`
      DELETE FROM waitlist_snapshots;
      DELETE FROM flights;
      VACUUM;
    `);
    console.log('Database cleared!');
  },

  reset: async () => {
    await db.initDb();
    if (!db.db) return;
    
    console.log('Dropping and recreating tables...');
    await db.db.exec(`
      DROP TABLE IF EXISTS waitlist_snapshots;
      DROP TABLE IF EXISTS flights;
    `);
    await db.createTables();
    console.log('Database reset complete!');
  }
};

// Handle command line arguments
const command = process.argv[2];
if (commands[command]) {
  commands[command]()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
} else {
  console.log(`
Available commands:
  init   - Initialize the database and create tables
  show   - Display all data in the database
  clear  - Remove all data but keep tables
  reset  - Drop and recreate all tables
  
Usage: node src/db-cli.js <command>
  `);
  process.exit(1);
}