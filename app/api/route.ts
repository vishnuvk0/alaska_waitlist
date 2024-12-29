import { NextResponse } from 'next/server';
import { db } from '../lib/db';
import { startSnapshotScheduler } from '../lib/snapshot-scheduler';
import { debugLog } from '../lib/server-utils';

// Start the snapshot scheduler when the server starts
if (process.env.NODE_ENV === 'production') {
  startSnapshotScheduler().catch(error => {
    debugLog('Failed to start snapshot scheduler: ' + (error instanceof Error ? error.message : 'Unknown error'));
  });
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

export async function POST() {
  return NextResponse.json({ status: 'ok' });
} 