import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { verifyUser, generateAlaskaName } from '../../../lib/auth-utils';

export async function POST(request: Request) {
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
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 