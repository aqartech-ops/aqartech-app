import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Sends email. Works in three situations:
 *  - SMTP configured (SMTP_HOST…): real email. During development a Gmail account with an
 *    "App password" works without owning a domain.
 *  - Not configured, development: the email is printed in the server terminal instead,
 *    so flows like "forgot password" can be tested with no email setup at all.
 *  - Not configured, production: refuses loudly (never print secrets to production logs).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.MAIL_FROM || process.env.SMTP_USER || 'AqarTech <no-reply@aqartech.local>';
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }

  get configured(): boolean {
    return this.transporter !== null;
  }

  async send(mail: Mail): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, ...mail });
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      this.logger.error(`Email to ${mail.to} NOT sent: SMTP is not configured.`);
      throw new Error('mail.notConfigured');
    }
    this.logger.warn(
      [
        '',
        '──────────── EMAIL (development: SMTP not configured, printed here instead) ────────────',
        `To:      ${mail.to}`,
        `Subject: ${mail.subject}`,
        '',
        mail.text,
        '────────────────────────────────────────────────────────────────────────────────────────',
      ].join('\n'),
    );
  }
}
