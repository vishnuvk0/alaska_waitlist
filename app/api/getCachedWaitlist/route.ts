import { NextResponse } from 'next/server';
import { getCachedWaitlist } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flightNumber = searchParams.get('flightNumber');
    const flightDate = searchParams.get('flightDate');

    if (!flightNumber || !flightDate) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      );
    }

    const segments = await getCachedWaitlist(flightNumber, flightDate);
    return NextResponse.json({ success: true, segments });
  } catch (error: any) {
    console.error('Error in getCachedWaitlist API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.status || 500 }
    );
  }
} 