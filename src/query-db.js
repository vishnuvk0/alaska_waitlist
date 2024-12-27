import db from './db.js';

async function queryDatabase() {
    try {
        // Initialize the database connection
        await db.initDb();
        
        if (!db.isDbAvailable) {
            throw new Error('Database connection not available');
        }

        const database = db.getDb();
        if (!database) {
            throw new Error('Database not initialized');
        }

        console.log('\n=== Querying Database Contents ===\n');

        // Query flights table
        const flights = await database.all(`
            SELECT * FROM flights
            ORDER BY flight_date DESC, flight_number
        `);
        
        console.log('=== Flights ===');
        console.table(flights);

        // Query waitlist_snapshots table with flight info
        const snapshots = await database.all(`
            SELECT 
                w.*,
                f.flight_number,
                f.flight_date
            FROM waitlist_snapshots w
            JOIN flights f ON w.flight_id = f.id
            ORDER BY w.snapshot_time DESC
        `);

        // Parse JSON strings back to arrays
        const processedSnapshots = snapshots.map(snapshot => ({
            ...snapshot,
            waitlist_names: JSON.parse(snapshot.waitlist_names)
        }));

        console.log('\n=== Waitlist Snapshots ===');
        console.table(processedSnapshots);

        // Get detailed statistics
        const stats = await database.get(`
            SELECT 
                COUNT(DISTINCT f.id) as total_flights,
                COUNT(DISTINCT w.id) as total_snapshots,
                MIN(f.flight_date) as earliest_date,
                MAX(f.flight_date) as latest_date
            FROM flights f
            LEFT JOIN waitlist_snapshots w ON f.id = w.flight_id
        `);

        console.log('\n=== Database Statistics ===');
        console.log(`Total Flights Tracked: ${stats.total_flights}`);
        console.log(`Total Snapshots: ${stats.total_snapshots}`);
        console.log(`Date Range: ${stats.earliest_date} to ${stats.latest_date}`);

        // Query for the most recent snapshots for each flight
        const recentSnapshots = await database.all(`
            WITH RankedSnapshots AS (
                SELECT 
                    w.*,
                    f.flight_number,
                    f.flight_date,
                    ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY w.snapshot_time DESC) as rn
                FROM waitlist_snapshots w
                JOIN flights f ON w.flight_id = f.id
            )
            SELECT *
            FROM RankedSnapshots
            WHERE rn = 1
            ORDER BY flight_date DESC, flight_number
        `);

        // Parse JSON strings back to arrays
        const processedRecentSnapshots = recentSnapshots.map(snapshot => ({
            ...snapshot,
            waitlist_names: JSON.parse(snapshot.waitlist_names)
        }));

        console.log('\n=== Most Recent Snapshot per Flight ===');
        console.table(processedRecentSnapshots);

    } catch (error) {
        console.error('Error querying database:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
    }
}

// Run the query and handle any uncaught errors
queryDatabase().then(() => {
    console.log('\nDatabase query complete.');
    process.exit(0);
}).catch(error => {
    console.error('Uncaught error:', error);
    process.exit(1);
}); 