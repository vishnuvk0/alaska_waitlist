import { NextResponse } from 'next/server';
import { trackWaitlist } from '@/lib/waitlist';
import { rateLimiter } from '@/lib/rate-limiter';
import { debugLog, logDatabaseState, serializeError } from '@/lib/server-utils';
import db from '@/lib/db';
import { trackEliteStatus } from '../../lib/elite-status-tracker';

// Helper function to safely serialize objects
function safeSerialize(obj: any): any {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Handle special cases
    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack
      };
    }
    return value;
  }));
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { flightNumber, flightDate, userName, forceRefresh } = body;

    if (!flightNumber || !flightDate || !userName) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      );
    }

    const flightKey = `${flightNumber}|${flightDate}`;
    
    // Check rate limit
    if (!rateLimiter.canScrape(flightKey)) {
      const waitTime = rateLimiter.getTimeUntilNextScrape(flightKey);
      return NextResponse.json({ 
        error: 'Rate limit exceeded',
        waitTimeMs: waitTime,
        message: `Please wait ${Math.ceil(waitTime / 1000)} seconds before trying again.`
      }, { status: 429 });
    }

    debugLog(`Processing waitlist request for flight ${flightNumber} on ${flightDate} for user ${userName}`);
    const result = await trackWaitlist(flightNumber, flightDate, userName, forceRefresh);
    
    // Log database state after successful tracking
    await logDatabaseState(db);
    
    // Safely serialize the result
    const safeResult = safeSerialize({
      segments: result.segments.map(segment => ({
        flightNumber: segment.flightNumber,
        date: segment.date,
        origin: segment.origin,
        destination: segment.destination,
        departureTime: segment.departureTime,
        arrivalTime: segment.arrivalTime,
        position: segment.position,
        totalWaitlisted: segment.totalWaitlisted,
        names: segment.names || [],
        error: segment.error,
        waitlistInfo: segment.waitlistInfo ? {
          capacity: segment.waitlistInfo.capacity,
          available: segment.waitlistInfo.available,
          checkedIn: segment.waitlistInfo.checkedIn
        } : undefined
      })),
      error: result.error
    });
    
    // Add this line to process elite status after each waitlist check
    await trackEliteStatus(db);
    
    return NextResponse.json(safeResult);
  } catch (error: any) {
    console.error('Error in trackWaitlist API:', error);
    const serializedError = serializeError(error);
    return NextResponse.json(
      { error: serializedError.message },
      { status: serializedError.status || 500 }
    );
  }
} 