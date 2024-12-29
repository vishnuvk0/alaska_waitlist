import { Database } from './db';
import { debugLog } from './server-utils';
import bcrypt from 'bcrypt';

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  status_level: string;
  created_at: string;
}

export interface CreateUserParams {
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  status_level: string;
}

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAlaskaName(firstName: string, lastName: string): string {
  const lastNamePrefix = lastName.slice(0, 3).toUpperCase();
  const firstInitial = firstName.slice(0, 1).toUpperCase();
  return `${lastNamePrefix}/${firstInitial}`;
}

export async function createUser(db: Database, params: CreateUserParams): Promise<User | null> {
  if (!db.isDbAvailable || !db.db) {
    throw new Error('Database not available');
  }

  try {
    const passwordHash = await hashPassword(params.password);
    
    const result = await db.db.run(`
      INSERT INTO users 
      (username, password_hash, first_name, last_name, status_level)
      VALUES (?, ?, ?, ?, ?)
    `, [
      params.username,
      passwordHash,
      params.first_name,
      params.last_name,
      params.status_level
    ]);

    if (result.lastID) {
      const user = await db.db.get<User>('SELECT id, username, first_name, last_name, status_level, created_at FROM users WHERE id = ?', [result.lastID]);
      return user || null;
    }
    return null;
  } catch (error) {
    debugLog('Error creating user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}

export async function verifyUser(db: Database, username: string, password: string): Promise<User | null> {
  if (!db.isDbAvailable || !db.db) {
    throw new Error('Database not available');
  }

  try {
    const user = await db.db.get<User & { password_hash: string }>('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user) {
      return null;
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return null;
    }

    // Don't return the password hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    debugLog('Error verifying user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}

export async function getUserByUsername(db: Database, username: string): Promise<User | null> {
  if (!db.isDbAvailable || !db.db) {
    throw new Error('Database not available');
  }

  try {
    const user = await db.db.get<User>(`
      SELECT id, username, first_name, last_name, status_level, created_at 
      FROM users 
      WHERE username = ?
    `, [username]);
    
    return user || null;
  } catch (error) {
    debugLog('Error getting user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
} 