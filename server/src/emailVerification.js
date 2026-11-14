import nodemailer from 'nodemailer';
import { config } from './config.js';

export async function sendVerificationEmail({ to, name, token }) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.mailFrom) {
    const error = new Error('Email delivery is not configured. Add SMTP settings to server/.env.');
    error.status = 503;
    throw error;
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  const link = `${config.clientUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: config.mailFrom,
    to,
    subject: 'Verify your WayShare email address',
    text: `Hi ${name},\n\nClick this link to verify your WayShare email address. The link expires in 30 minutes.\n\n${link}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Verify your WayShare email</h2><p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to activate your WayShare account.</p><p><a href="${link}" style="display:inline-block;background:#ef5947;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Verify email address</a></p><p>This link expires in 30 minutes. If you did not create this account, ignore this email.</p></div>`
  });
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
