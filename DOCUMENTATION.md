# Technical Documentation

## Core Functionality

### Waitlist Tracking (`app/lib/waitlist.ts`)

#### `trackWaitlist(flightNumber, flightDate, userName, forceRefresh)`
Main function that tracks waitlist positions for Alaska Airlines flights.
- **Parameters:**
  - `flightNumber`: Flight number (e.g., "1234")
  - `flightDate`: Date of flight in YYYY-MM-DD format
  - `userName`: User's Alaska Airlines format name (e.g., "SMITH/J")
  - `forceRefresh`: Boolean to bypass cache and fetch fresh data
- **Returns:** Object containing flight segments and waitlist positions
- **Process:**
  1. Checks cache for recent data (< 5 minutes old)
  2. If needed, scrapes Alaska Airlines website
  3. Parses waitlist information
  4. Stores results in SQLite database
  5. Tracks elite status changes

### Flight Parsing (`app/lib/flight-utils.ts`)

#### `parseFlightSegments($)`
Parses flight information from the Alaska Airlines webpage.
- **Parameters:** Cheerio instance with loaded HTML
- **Returns:** Array of flight segments with:
  - Flight numbers
  - Origins/destinations
  - Departure/arrival times
  - Dates

#### `parseWaitlistForSegment($, segmentIndex)`
Extracts waitlist information for a specific flight segment.
- **Parameters:**
  - Cheerio instance
  - Segment index
- **Returns:** Waitlist snapshot containing:
  - List of names
  - First class capacity
  - Available seats
  - Checked-in passengers

### Elite Status Tracking (`app/lib/elite-status-tracker.ts`)

#### `processWaitlistSnapshot()`
Analyzes waitlist changes to determine passenger elite status.
- **Logic:**
  - T-120 to T-72: MVP Gold 75K
  - T-72 to T-48: MVP Gold
  - < T-48: MVP
- **Tracks:**
  - New additions to waitlist
  - Position changes
  - Removal from waitlist

#### `trackEliteStatus()`
Periodic job that updates elite status database.
- Monitors all tracked flights
- Updates status based on timing rules
- Maintains historical status data

## Database Operations (`app/lib/db.ts`)

#### `saveFlightSegment(segment, segmentIndex)`
Stores flight information in database.
- Creates/updates flight records
- Maintains segment ordering
- Returns flight ID for relationships

#### `saveWaitlistSnapshot(flightId, waitlistInfo)`
Records point-in-time waitlist state.
- Stores passenger lists
- Tracks seat availability
- Maintains historical data

#### `getLatestWaitlistData(flightNumber, flightDate)`
Retrieves most recent waitlist information.
- Returns latest snapshot for each segment
- Includes flight details
- Used for caching layer

## Browser Automation (`app/lib/browser-utils.ts`)

#### `createPage()`
Sets up Puppeteer browser instance.
- Configures headless mode
- Sets user agent
- Handles cookies

#### `needsVerification(page)`
Checks if Alaska Airlines requires verification.
- Detects security challenges
- Identifies CAPTCHA requests

#### `handlePressAndHoldVerification(page)`
Automates verification process.
- Simulates human interaction
- Handles press-and-hold verification
- Waits for success

## API Routes

### `/api/trackWaitlist`
Main endpoint for waitlist tracking.
- **Method:** POST
- **Body:**
  ```typescript
  {
    flightNumber: string;
    flightDate: string;
    userName: string;
    forceRefresh?: boolean;
  }
  ```
- **Returns:** Waitlist data or error
- **Features:**
  - Rate limiting
  - Error handling
  - Cache management

### `/api/auth/signup`
User registration endpoint.
- Creates new users
- Generates Alaska-style names
- Sets elite status level

### `/api/auth/login`
Authentication endpoint.
- Validates credentials
- Returns user profile
- Sets session

## Frontend Components

### `WaitlistForm` (`app/components/WaitlistForm.tsx`)
Input form for flight tracking.
- Flight number validation
- Date range checking
- Error handling

### `WaitlistResults` (`app/components/WaitlistResults.tsx`)
Displays waitlist information.
- Shows position
- Displays full waitlist
- Indicates upgrade likelihood
- Auto-refresh capability

## Utility Functions

### Rate Limiting (`app/lib/rate-limiter.ts`)
Prevents excessive scraping.
- Per-flight limits
- Cooldown periods
- Cache management

### Error Handling (`app/lib/server-utils.ts`)
Centralized error processing.
- Error serialization
- Logging
- Client-safe messages

### Database Utilities (`app/lib/db-utils.ts`)
Helper functions for database operations.
- Connection management
- Transaction handling
- Migration support

## Security Features

## Deployment Configuration

### PM2 Configuration (`ecosystem.config.cjs`)
```javascript
{
  name: 'alaska-waitlist',
  script: 'node_modules/next/dist/bin/next',
  args: 'start',
  instances: '1',
  exec_mode: 'fork',
  env: {
    PORT: 3000,
    NODE_ENV: 'production',
    HOSTNAME: '0.0.0.0'
  }
}
```

### Next.js Configuration (`next.config.js`)
```javascript
{
  webpack: {...},  // Puppeteer optimizations
  experimental: {
    esmExternals: true
  },
  poweredByHeader: false,
  compress: true
}
``` 