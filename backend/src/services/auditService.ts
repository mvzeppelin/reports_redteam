import { pool } from '../db/pool';

export type AuditEvent =
  | 'OTP_REQUESTED'
  | 'OTP_REQUEST_UNKNOWN_EMAIL'
  | 'OTP_VERIFIED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ALREADY_USED'
  | 'SESSION_CREATED'
  | 'SESSION_INVALIDATED'
  | 'LOGOUT'
  | 'RATE_LIMIT_OTP_REQUEST'
  | 'RATE_LIMIT_OTP_VERIFY'
  | 'EMAIL_COOLDOWN_ACTIVE'
  | 'REPORT_UPLOADED'
  | 'REPORT_UPLOAD_FAILED'
  | 'REPORT_TOGGLED'
  | 'REPORT_RENAMED'
  | 'REPORT_DELETED'
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_UPDATED'
  | 'ADMIN_USER_DELETED'
  | 'ADMIN_SESSION_INVALIDATED'
  | 'RATE_LIMIT_REPORT_UPLOAD';

export async function logEvent(
  event: AuditEvent,
  ip: string | null,
  email: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (event_type, ip_address, email, details)
       VALUES ($1, $2, $3, $4)`,
      [event, ip, email, details ? JSON.stringify(details) : null],
    );
  } catch (err) {
    console.error('[audit] falha ao gravar log:', err);
  }
}
