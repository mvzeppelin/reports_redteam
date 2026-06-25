import { Request, Response, NextFunction } from 'express';
import { redis } from '../redis/client';
import { config } from '../config';
import { logEvent, AuditEvent } from '../services/auditService';

function getIP(req: Request): string {
  return (
    (req.headers['x-real-ip'] as string) ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    '0.0.0.0'
  );
}

interface RateLimitOptions {
  keyPrefix: string;
  max: number;
  windowSeconds: number;
  blockSeconds: number;
  auditEvent: AuditEvent;
  // Por padrão usa IP; passar função para chave customizada (ex: por usuário autenticado)
  getKey?: (req: Request) => string;
}

function createRateLimiter(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getIP(req);
    const key = opts.getKey ? opts.getKey(req) : ip;
    const blockKey = `rl:block:${opts.keyPrefix}:${key}`;
    const countKey = `rl:count:${opts.keyPrefix}:${key}`;

    const isBlocked = await redis.exists(blockKey);
    if (isBlocked) {
      const ttl = await redis.ttl(blockKey);
      await logEvent(opts.auditEvent, ip, req.session?.email ?? null, { rateLimitKey: key, ttlSeconds: ttl });
      res.status(429).json({
        error: 'Limite de uploads atingido. Tente novamente mais tarde.',
        retryAfterSeconds: ttl > 0 ? ttl : opts.blockSeconds,
      });
      return;
    }

    const pipeline = redis.pipeline();
    pipeline.incr(countKey);
    pipeline.expire(countKey, opts.windowSeconds);
    const results = await pipeline.exec();

    const count = results?.[0]?.[1] as number ?? 0;

    if (count > opts.max) {
      await redis.set(blockKey, '1', 'EX', opts.blockSeconds);
      await redis.del(countKey);
      await logEvent(opts.auditEvent, ip, req.session?.email ?? null, { rateLimitKey: key, count });
      res.status(429).json({
        error: 'Limite de uploads atingido. Tente novamente mais tarde.',
        retryAfterSeconds: opts.blockSeconds,
      });
      return;
    }

    req.clientIP = ip;
    next();
  };
}

export const otpRequestRateLimiter = createRateLimiter({
  keyPrefix: 'otp_req',
  max: config.rateLimit.otpRequest.ipMax,
  windowSeconds: config.rateLimit.otpRequest.ipWindowSeconds,
  blockSeconds: config.rateLimit.blockSeconds,
  auditEvent: 'RATE_LIMIT_OTP_REQUEST',
});

export const otpVerifyRateLimiter = createRateLimiter({
  keyPrefix: 'otp_ver',
  max: config.rateLimit.otpVerify.ipMax,
  windowSeconds: config.rateLimit.otpVerify.ipWindowSeconds,
  blockSeconds: config.rateLimit.blockSeconds,
  auditEvent: 'RATE_LIMIT_OTP_VERIFY',
});

// Limita uploads por usuário autenticado (email), não por IP —
// mais justo em ambientes com NAT ou IPs compartilhados.
export const reportUploadRateLimiter = createRateLimiter({
  keyPrefix: 'rpt_up',
  max: config.rateLimit.reportUpload.userMax,
  windowSeconds: config.rateLimit.reportUpload.userWindowSeconds,
  blockSeconds: config.rateLimit.blockSeconds,
  auditEvent: 'RATE_LIMIT_REPORT_UPLOAD',
  getKey: (req) => req.session?.email ?? getIP(req),
});

export async function checkEmailCooldown(email: string): Promise<{ blocked: boolean; ttl: number }> {
  const key = `rl:email:${email.toLowerCase()}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) {
    return { blocked: true, ttl };
  }
  return { blocked: false, ttl: 0 };
}

export async function setEmailCooldown(email: string): Promise<void> {
  const key = `rl:email:${email.toLowerCase()}`;
  await redis.set(key, '1', 'EX', config.otp.cooldownSeconds);
}

declare global {
  namespace Express {
    interface Request {
      clientIP?: string;
    }
  }
}
