/**
 * Outbound email via SMTP (nodemailer). Only used for user account verification today.
 * Configured through SMTP_* env (see config.smtp); when unconfigured, isEmailEnabled() is
 * false and callers fall back to creating users active.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('email');

let transporter: Transporter | undefined;

export function isEmailEnabled(): boolean {
  return config.smtp.enabled;
}

function getTransport(): Transporter {
  if (!transporter) {
    const { host, port, secure, user, pass } = config.smtp;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
  }
  return transporter;
}

/** Base URL for links in emails: AUTH_PUBLIC_URL, else the app's client URL. */
function publicBase(): string {
  return config.auth.sso.publicUrl || config.clientUrl;
}

/** Send the account-verification email. Returns false (logged) rather than throwing. */
export async function sendVerificationEmail(to: string, username: string, token: string): Promise<boolean> {
  if (!isEmailEnabled() || !to) return false;
  const url = `${publicBase()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    await getTransport().sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject: 'Confirm your AgenticBEAR account',
      text: `Hi ${username},\n\nAn AgenticBEAR account was created for you. Confirm your email to activate it:\n\n${url}\n\nIf you weren't expecting this, you can ignore this message.`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#1a2332">
          <h2 style="font-size:18px;margin:0 0 12px">Confirm your account</h2>
          <p style="font-size:14px;line-height:1.5;color:#44506a">Hi <b>${username}</b>, an AgenticBEAR account was created for you. Confirm your email to activate it.</p>
          <p style="margin:20px 0">
            <a href="${url}" style="display:inline-block;background:#7c8cf8;color:#021526;font-weight:600;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:8px">Confirm account</a>
          </p>
          <p style="font-size:12px;color:#8a93a6">Or paste this link: <br><span style="word-break:break-all">${url}</span></p>
          <p style="font-size:12px;color:#8a93a6">If you weren't expecting this, you can ignore this message.</p>
        </div>`,
    });
    log.info(`Verification email sent to ${to}`);
    return true;
  } catch (err) {
    log.error(`Failed to send verification email to ${to}`, err);
    return false;
  }
}
