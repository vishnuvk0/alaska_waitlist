import db from './db.js';

async function queryDatabase() {
    try {
        // Initialize the database connection
        await db.initDb();
        
        console.log('\n=== Querying Database Contents ===\n');

        // Query flights table
        const flights = await db.db.all(`
            SELECT * FROM flights
            ORDER BY flight_date DESC, flight_number
        `);
        
        console.log('=== Flights ===');
        console.table(flights);

        // Query waitlist_snapshots table with flight info
        const snapshots = await db.db.all(`
            SELECT 
                w.*,
                f.flight_number,
                f.flight_date
            FROM waitlist_snapshots w
            JOIN flights f ON w.flight_id = f.id
            ORDER BY w.timestamp DESC
        `);

        console.log('\n=== Waitlist Snapshots ===');
        console.table(snapshots);

        // Get detailed statistics
        const stats = await db.db.get(`
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
        const recentSnapshots = await db.db.all(`
            WITH RankedSnapshots AS (
                SELECT 
                    w.*,
                    f.flight_number,
                    f.flight_date,
                    ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY w.timestamp DESC) as rn
                FROM waitlist_snapshots w
                JOIN flights f ON w.flight_id = f.id
            )
            SELECT *
            FROM RankedSnapshots
            WHERE rn = 1
            ORDER BY flight_date DESC, flight_number
        `);

        console.log('\n=== Most Recent Snapshot per Flight ===');
        console.table(recentSnapshots);

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        // Close the database connection
        await db.db.close();
    }
}

// Run the query
queryDatabase().then(() => {
    console.log('\nDatabase query complete.');
}).catch(console.error); 