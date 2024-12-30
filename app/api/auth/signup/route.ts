import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { createUser, generateAlaskaName } from '../../../lib/auth-utils';
import { EliteStatus } from '../../../lib/elite-status-tracker';
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
    const { username, password, first_name, last_name, status_level } = body;

    // Validate required fields
    if (!username || !password || !first_name || !last_name || !status_level) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate status level
    if (!Object.values(EliteStatus).includes(status_level as EliteStatus)) {
      return NextResponse.json(
        { error: 'Invalid status level' },
        { status: 400 }
      );
    }

    // Initialize database if needed
    if (!db.isDbAvailable) {
      await db.initDb();
    }

    // Check if username already exists
    const existingUser = await db.db?.get(
      'SELECT username FROM users WHERE username = ?',
      [username]
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }

    // Create the user
    const user = await createUser(db, {
      username,
      password,
      first_name,
      last_name,
      status_level,
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Generate Alaska-style name
    const alaskaName = generateAlaskaName(first_name, last_name);

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
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 