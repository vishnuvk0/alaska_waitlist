import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { verifyUser, generateAlaskaName } from '../../../lib/auth-utils';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  // Ensure proper content type
  const contentType = headers().get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Initialize database if needed
    if (!db.isDbAvailable) {
      await db.initDb();
    }

    // Verify user credentials
    const user = await verifyUser(db, username, password);

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Generate Alaska-style name
    const alaskaName = generateAlaskaName(user.first_name, user.last_name);

    // Return user data (excluding sensitive information)
    return NextResponse.json({
      user: {
        ...user,
        alaska_name: alaskaName,
      },
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 