import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';

if (config.proxy) {
  const proxyUrl = new URL(config.proxy);

  if (config.proxyInsecure) {
    // Desabilita verificação TLS globalmente no processo — necessário quando o proxy
    // intercepta HTTPS e apresenta seu próprio certificado (ex: Burp Suite MITM).
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const agent = new HttpsProxyAgent({
    host: proxyUrl.hostname,
    port: Number(proxyUrl.port) || 8080,
    protocol: proxyUrl.protocol,  // 'http:' evita TLS desnecessário na conexão com o proxy
  });

  (globalThis as any).fetch = async (url: any, init?: any) => {
    try {
      return await nodeFetch(url, { ...init, agent });
    } catch (err: any) {
      console.error('[email] fetch error:', String(url), err?.message ?? err);
      throw err;
    }
  };

  console.log(`[email] proxy configurado: ${config.proxy}${config.proxyInsecure ? ' (TLS não verificado)' : ''}`);
}

let smtpTransporter: nodemailer.Transporter | null = null;
let resendClient: Resend | null = null;

function getSmtpTransporter(): nodemailer.Transporter {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.user
        ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
        : undefined,
    });
  }
  return smtpTransporter;
}

function getResendClient(): Resend {
  if (!resendClient) {
    if (!config.email.resendApiKey) {
      throw new Error('RESEND_API_KEY é obrigatório quando EMAIL_PROVIDER=resend');
    }
    resendClient = new Resend(config.email.resendApiKey);
  }
  return resendClient;
}

function buildEmailHtml(otp: string, expiresInMinutes: number): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Seu código de acesso</title></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
        <h2 style="color:#1a1a1a;margin-top:0">Código de acesso</h2>
        <p style="color:#444">Use o código abaixo para entrar no portal:</p>
        <div style="background:#f0f4ff;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb">${otp}</span>
        </div>
        <p style="color:#666;font-size:14px">
          Este código é válido por <strong>${expiresInMinutes} minutos</strong> e pode ser usado apenas uma vez.
        </p>
        <p style="color:#999;font-size:12px;margin-bottom:0">
          Se você não solicitou este código, ignore este e-mail.
        </p>
      </div>
    </body>
    </html>
  `;
}

function buildFrom(): string {
  const { from, fromName } = config.email;
  return fromName ? `${fromName} <${from}>` : from;
}

export async function sendOTPEmail(to: string, otp: string, expiresInMinutes: number): Promise<void> {
  const html = buildEmailHtml(otp, expiresInMinutes);
  const subject = `${otp} — Seu código de acesso`;
  const text = `Seu código de acesso: ${otp}\nVálido por ${expiresInMinutes} minutos.`;
  const from = buildFrom();

  if (config.email.provider === 'resend') {
    const client = getResendClient();
    const result = await client.emails.send({ from, to, subject, html, text });
    if (result.error) {
      console.error('[email] resend erro:', result.error);
      throw new Error(`Resend: ${result.error.message}`);
    }
    console.log(`[email] resend enviado id=${result.data?.id}`);
    return;
  }

  await getSmtpTransporter().sendMail({ from, to, subject, html, text });
}
