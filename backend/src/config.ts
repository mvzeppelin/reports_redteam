function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  return value;
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? parseInt(v, 10) : fallback;
}

export const config = {
  port: intEnv('PORT', 3001),

  db: {
    connectionString: requireEnv('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
  },

  otp: {
    secret: requireEnv('OTP_SECRET'),
    durationSeconds: intEnv('OTP_DURATION_SECONDS', 300),
    cooldownSeconds: intEnv('OTP_COOLDOWN_SECONDS', 180),
  },

  session: {
    secret: requireEnv('SESSION_SECRET'),
    durationSeconds: intEnv('SESSION_DURATION_SECONDS', 86400),
    cookieName: 'auth_session',
    secure: process.env.COOKIE_SECURE === 'true',
  },

  email: {
    provider: (process.env.EMAIL_PROVIDER || 'smtp') as 'smtp' | 'resend',
    from: process.env.EMAIL_FROM || 'noreply@auth.local',
    fromName: process.env.EMAIL_FROM_NAME || undefined,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    smtp: {
      host: process.env.SMTP_HOST || 'mailhog',
      port: intEnv('SMTP_PORT', 1025),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      ignoreTLS: process.env.SMTP_IGNORE_TLS === 'true',
      tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  },

  proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || undefined,
  proxyInsecure: process.env.PROXY_INSECURE === 'true',

  rateLimit: {
    otpRequest: {
      ipMax: intEnv('OTP_REQUEST_IP_MAX', 10),
      ipWindowSeconds: intEnv('OTP_REQUEST_IP_WINDOW_SECONDS', 600),
    },
    otpVerify: {
      ipMax: intEnv('OTP_VERIFY_IP_MAX', 10),
      ipWindowSeconds: intEnv('OTP_VERIFY_IP_WINDOW_SECONDS', 300),
    },
    reportUpload: {
      userMax: intEnv('UPLOAD_RATE_MAX', 20),
      userWindowSeconds: intEnv('UPLOAD_RATE_WINDOW_SECONDS', 3600),
    },
    blockSeconds: intEnv('RATE_LIMIT_BLOCK_SECONDS', 900),
  },
} as const;
