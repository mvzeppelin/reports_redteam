import crypto from 'crypto';
import { pool } from '../db/pool';
import { config } from '../config';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto
    .createHmac('sha256', config.session.secret)
    .update(token)
    .digest('hex');
}

export interface Session {
  userId: number;
  email: string;
  expiresAt: Date;
  isAdmin: boolean;
}

export async function createSession(userId: number): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.session.durationSeconds * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE sessions
       SET invalidated_at = NOW()
       WHERE user_id = $1 AND invalidated_at IS NULL`,
      [userId],
    );

    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return token;
}

export async function validateSession(token: string): Promise<Session | null> {
  const tokenHash = hashToken(token);

  const { rows } = await pool.query<{ user_id: number; email: string; expires_at: Date; is_admin: boolean }>(
    `SELECT s.user_id, u.email, s.expires_at, u.is_admin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.invalidated_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE`,
    [tokenHash],
  );

  if (rows.length === 0) return null;

  return {
    userId: rows[0].user_id,
    email: rows[0].email,
    expiresAt: rows[0].expires_at,
    isAdmin: rows[0].is_admin,
  };
}

export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE sessions SET invalidated_at = NOW() WHERE token_hash = $1`,
    [tokenHash],
  );
}
