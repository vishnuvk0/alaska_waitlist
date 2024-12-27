import { NextResponse } from 'next/server';
import { trackWaitlist } from '@/lib/waitlist';
import { rateLimiter } from '@/lib/rate-limiter';
import { debugLog, logDatabaseState } from '@/lib/server-utils';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { flightNumber, flightDate, userName } = body;

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
    const result = await trackWaitlist(flightNumber, flightDate, userName);
    
    // Log database state after successful tracking
    await logDatabaseState(db);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in trackWaitlist API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.status || 500 }
    );
  }
} 