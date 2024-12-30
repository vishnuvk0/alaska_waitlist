import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Handle preflight requests
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Middleware to handle errors
export function middleware(handler: Function) {
  return async (request: Request) => {
    try {
      // Ensure proper content type for non-GET requests
      if (request.method !== 'GET') {
        const contentType = headers().get('content-type');
        if (!contentType?.includes('application/json')) {
          return NextResponse.json(
            { error: 'Content-Type must be application/json' },
            { status: 415 }
          );
        }
      }

      return await handler(request);
    } catch (error) {
      console.error('API error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
} 