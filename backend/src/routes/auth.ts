import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { config } from '../config';
import { createOTP, verifyOTP } from '../services/otpService';
import { sendOTPEmail } from '../services/emailService';
import { createSession, invalidateSession } from '../services/sessionService';
import { logEvent } from '../services/auditService';
import {
  otpRequestRateLimiter,
  otpVerifyRateLimiter,
  checkEmailCooldown,
  setEmailCooldown,
} from '../middleware/rateLimiter';
import { authenticate } from '../middleware/authenticate';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setCookieSession(res: Response, token: string): void {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.session.secure,
    maxAge: config.session.durationSeconds * 1000,
    path: '/',
  });
}

// POST /api/auth/request-otp
authRouter.post('/request-otp', otpRequestRateLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const ip = req.clientIP ?? req.ip ?? '0.0.0.0';

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: 'E-mail inválido.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Cooldown por e-mail
  const cooldown = await checkEmailCooldown(normalizedEmail);
  if (cooldown.blocked) {
    await logEvent('EMAIL_COOLDOWN_ACTIVE', ip, normalizedEmail, { ttl: cooldown.ttl });
    // Resposta genérica: não revelar se o e-mail existe
    res.status(200).json({
      message: 'Se o e-mail estiver cadastrado, você receberá um código em breve.',
      cooldownSeconds: cooldown.ttl,
    });
    return;
  }

  // Verificar se o usuário existe
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1',
    [normalizedEmail],
  );

  if (rows.length === 0) {
    await logEvent('OTP_REQUEST_UNKNOWN_EMAIL', ip, normalizedEmail);
    // Resposta genérica para não revelar existência do e-mail
    await setEmailCooldown(normalizedEmail);
    res.status(200).json({
      message: 'Se o e-mail estiver cadastrado, você receberá um código em breve.',
      cooldownSeconds: config.otp.cooldownSeconds,
      expiresInSeconds: config.otp.durationSeconds,
    });
    return;
  }

  const userId = rows[0].id;

  await setEmailCooldown(normalizedEmail);

  const { code, expiresAt } = await createOTP(userId);

  // Enviar e-mail em background — não falhar a request por isso
  sendOTPEmail(normalizedEmail, code, Math.round(config.otp.durationSeconds / 60)).catch((err) => {
    console.error('[email] falha ao enviar OTP:', err);
  });

  await logEvent('OTP_REQUESTED', ip, normalizedEmail);

  res.status(200).json({
    message: 'Se o e-mail estiver cadastrado, você receberá um código em breve.',
    cooldownSeconds: config.otp.cooldownSeconds,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: config.otp.durationSeconds,
  });
});

// POST /api/auth/verify-otp
authRouter.post('/verify-otp', otpVerifyRateLimiter, async (req: Request, res: Response) => {
  const { email, code } = req.body as { email?: string; code?: string };
  const ip = req.clientIP ?? req.ip ?? '0.0.0.0';

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: 'E-mail inválido.' });
    return;
  }

  if (!code || typeof code !== 'string' || !/^\d{7}$/.test(code.trim())) {
    res.status(400).json({ error: 'Código inválido. O código deve ter 7 dígitos.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1',
    [normalizedEmail],
  );

  if (rows.length === 0) {
    await logEvent('OTP_INVALID', ip, normalizedEmail, { reason: 'user_not_found' });
    res.status(400).json({ error: 'Código inválido ou expirado.' });
    return;
  }

  const userId = rows[0].id;
  const result = await verifyOTP(userId, normalizedCode);

  if (!result.ok) {
    const auditReason = result.reason;
    await logEvent(
      auditReason === 'expired' ? 'OTP_EXPIRED'
        : auditReason === 'already_used' ? 'OTP_ALREADY_USED'
        : 'OTP_INVALID',
      ip,
      normalizedEmail,
      { reason: auditReason },
    );

    const message =
      auditReason === 'expired'
        ? 'Este código expirou. Solicite um novo código.'
        : 'Código inválido ou expirado.';

    res.status(400).json({ error: message });
    return;
  }

  const token = await createSession(userId);
  setCookieSession(res, token);

  await logEvent('SESSION_CREATED', ip, normalizedEmail);
  await logEvent('OTP_VERIFIED', ip, normalizedEmail);

  res.status(200).json({ message: 'Autenticado com sucesso.' });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({
    email: req.session!.email,
    expiresAt: req.session!.expiresAt,
    isAdmin: req.session!.isAdmin,
  });
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req: Request, res: Response) => {
  const token = req.cookies?.[config.session.cookieName];
  const ip = req.clientIP ?? req.ip ?? '0.0.0.0';

  if (token) {
    await invalidateSession(token);
    await logEvent('LOGOUT', ip, req.session!.email);
  }

  res.clearCookie(config.session.cookieName, { path: '/' });
  res.json({ message: 'Sessão encerrada.' });
});
