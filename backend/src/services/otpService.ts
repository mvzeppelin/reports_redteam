import crypto from 'crypto';
import { pool } from '../db/pool';
import { config } from '../config';

function generateOTPCode(): string {
  const n = crypto.randomInt(1_000_000, 10_000_000);
  return n.toString();
}

function hashCode(code: string): string {
  return crypto
    .createHmac('sha256', config.otp.secret)
    .update(code)
    .digest('hex');
}

export interface CreatedOTP {
  code: string;
  expiresAt: Date;
}

export async function createOTP(userId: number): Promise<CreatedOTP> {
  const code = generateOTPCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + config.otp.durationSeconds * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE otp_codes
       SET invalidated_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL
         AND invalidated_at IS NULL`,
      [userId],
    );

    await client.query(
      `INSERT INTO otp_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, codeHash, expiresAt],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; userId: number }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' | 'invalidated' };

export async function verifyOTP(userId: number, code: string): Promise<VerifyResult> {
  const codeHash = hashCode(code);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      id: number;
      expires_at: Date;
      used_at: Date | null;
      invalidated_at: Date | null;
    }>(
      `SELECT id, expires_at, used_at, invalidated_at
       FROM otp_codes
       WHERE user_id = $1 AND code_hash = $2
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId, codeHash],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }

    const row = rows[0];

    if (row.invalidated_at !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalidated' };
    }

    if (row.used_at !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'already_used' };
    }

    if (new Date() > new Date(row.expires_at)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'expired' };
    }

    await client.query(
      `UPDATE otp_codes SET used_at = NOW() WHERE id = $1`,
      [row.id],
    );

    await client.query('COMMIT');
    return { ok: true, userId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
