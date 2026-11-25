import nodemailer, { type Transporter } from 'nodemailer';
import { env, getEmailProvider, isEmailConfigured } from '../config/env.js';
import { generateQrPngBuffer } from './signing.js';
import { buildGoogleCalendarUrl } from './validation.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.gmailUser.trim() || !env.gmailAppPassword.trim()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: {
        user: env.gmailUser.trim(),
        // Strip spaces automatically in case the 16-char Google App Password was pasted with spaces
        pass: env.gmailAppPassword.replace(/\s+/g, ''),
      },
    });
  }
  return transporter;
}

function getPrimaryClientUrl(): string {
  return env.clientUrl.split(',')[0]?.trim().replace(/\/$/, '') || 'http://localhost:5173';
}

function formatReadable(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: env.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function wrapStudyDockLayout(subtitle: string, title: string, bodyHtml: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;background:#004643;color:#F0EDE5;padding:28px;">
      <div style="border:1.5px solid rgba(240,237,229,0.45);background:#00312F;padding:24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:rgba(240,237,229,0.72);">
          STUDYDOCK // ${subtitle}
        </div>
        <h1 style="margin:8px 0 0;font-size:26px;letter-spacing:0.5px;text-transform:uppercase;color:#F0EDE5;">
          ${title}
        </h1>
      </div>
      <div style="border:1px solid rgba(240,237,229,0.28);border-top:none;background:#0B6B65;padding:24px;color:#F0EDE5;">
        ${bodyHtml}
      </div>
      <div style="padding-top:16px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(240,237,229,0.65);text-align:center;">
        StudyDock Smart Library · Automated Reservation Dispatch
      </div>
    </div>
  `;
}

interface InlineAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

/**
 * Dispatches email using the active provider:
 * 1. Brevo HTTP API (port 443 — works on Render Free Tier with your Gmail sender)
 * 2. Resend HTTP API (port 443 — works on Render Free Tier)
 * 3. Gmail SMTP via Nodemailer (works locally and on hosts allowing ports 465/587)
 */
async function dispatchEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachment?: InlineAttachment;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const provider = getEmailProvider();
  if (provider === 'none' || !isEmailConfigured()) {
    return { sent: false, skipped: true };
  }

  try {
    if (provider === 'brevo') {
      const senderEmail = env.emailFrom.trim();
      const payload: Record<string, unknown> = {
        sender: { name: 'StudyDock Library', email: senderEmail },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      };
      if (params.attachment) {
        payload.attachment = [
          {
            name: params.attachment.filename,
            content: params.attachment.content.toString('base64'),
          },
        ];
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': env.brevoApiKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[email:brevo] HTTP ${res.status}:`, errBody);
        return { sent: false, error: `Brevo HTTP ${res.status}: ${errBody}` };
      }
      return { sent: true };
    }

    if (provider === 'resend') {
      const fromAddress = env.emailFrom.trim()
        ? `StudyDock Library <${env.emailFrom.trim()}>`
        : 'StudyDock Library <onboarding@resend.dev>';
      const payload: Record<string, unknown> = {
        from: fromAddress,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      };
      if (params.attachment) {
        payload.attachments = [
          {
            filename: params.attachment.filename,
            content: params.attachment.content.toString('base64'),
            content_id: params.attachment.cid,
          },
        ];
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.resendApiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[email:resend] HTTP ${res.status}:`, errBody);
        return { sent: false, error: `Resend HTTP ${res.status}: ${errBody}` };
      }
      return { sent: true };
    }

    // Fallback: Gmail SMTP (Nodemailer)
    const mailer = getTransporter();
    if (!mailer) return { sent: false, skipped: true };

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachment
        ? [
            {
              filename: params.attachment.filename,
              content: params.attachment.content,
              cid: params.attachment.cid,
            },
          ]
        : undefined,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = /ETIMEDOUT|ECONNREFUSED|timeout/i.test(message)
      ? ' (Hint: Render Free Tier blocks outbound SMTP ports 465/587 — set BREVO_API_KEY to send over HTTPS port 443.)'
      : '';
    console.error(`[email:${provider}] Dispatch failed: ${message}${hint}`);
    return { sent: false, error: `${message}${hint}` };
  }
}

export async function sendBookingConfirmationEmail(params: {
  to: string;
  studentName: string;
  seatLabel: string;
  floorName: string;
  section: string;
  startAt: string;
  endAt: string;
  sixDigitCode: string;
  signedToken: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    console.info(
      `[email:dev] Seat confirmation skipped (configure BREVO_API_KEY or GMAIL_USER/GMAIL_APP_PASSWORD). To=${params.to} Seat=${params.seatLabel} Code=${params.sixDigitCode}`,
    );
    return { sent: false, skipped: true };
  }

  const qrBuffer = await generateQrPngBuffer(params.signedToken);
  const qrFilename = `studydock-seat-${params.seatLabel.replace(/[^a-zA-Z0-9-_]/g, '')}-qr.png`;
  const gcalUrl = buildGoogleCalendarUrl({
    title: `StudyDock Seat ${params.seatLabel} (${params.floorName})`,
    details: `Unique 6-digit gate code: ${params.sixDigitCode}. Present your QR code at the library gate.`,
    location: `${params.floorName} — ${params.section}, Seat ${params.seatLabel}`,
    startAt: new Date(params.startAt),
    endAt: new Date(params.endAt),
  });

  // Matching cid to filename allows inline rendering across Gmail SMTP, Resend, and Brevo
  const html = wrapStudyDockLayout(
    'SEAT RESERVATION CONFIRMED',
    `DESK ${params.seatLabel} // ENTRY PASS`,
    `
      <p style="margin-top:0;font-size:14px;line-height:1.6;">Hi <strong>${params.studentName}</strong>,</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(240,237,229,0.88);">
        Your reading desk is confirmed. Show the <strong>signed QR code</strong> (embedded below and attached as PNG) or enter your <strong>unique 6-digit gate code</strong> at the entrance. Entry opens 15 minutes before start time and auto-releases if unclaimed after 15 minutes.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;border-top:1px solid rgba(240,237,229,0.25);border-bottom:1px solid rgba(240,237,229,0.25);">
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Desk</td><td style="padding:8px 0;font-weight:700;text-align:right;font-family:monospace;">${params.seatLabel}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Location</td><td style="padding:8px 0;text-align:right;">${params.floorName} · ${params.section}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Start</td><td style="padding:8px 0;text-align:right;">${formatReadable(params.startAt)}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">End</td><td style="padding:8px 0;text-align:right;">${formatReadable(params.endAt)}</td></tr>
      </table>

      <div style="text-align:center;margin:22px 0;background:#00312F;border:1px solid rgba(240,237,229,0.45);padding:22px;">
        <div style="display:inline-block;background:#F0EDE5;padding:12px;">
          <img src="cid:${qrFilename}" alt="StudyDock Gate QR Code" style="width:210px;height:210px;display:block;" />
        </div>
        <div style="margin-top:16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(240,237,229,0.72);">
          UNIQUE 6-DIGIT GATE CODE (SINGLE-USE)
        </div>
        <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#F0EDE5;margin-top:6px;">
          ${params.sixDigitCode}
        </div>
      </div>

      <div style="text-align:center;margin-top:20px;">
        <a href="${gcalUrl}" style="display:inline-block;background:#F0EDE5;color:#004643;padding:12px 22px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
          ADD TO GOOGLE CALENDAR →
        </a>
      </div>
    `,
  );

  const result = await dispatchEmail({
    to: params.to,
    subject: `StudyDock Seat ${params.seatLabel} Confirmed — Code ${params.sixDigitCode}`,
    html,
    attachment: {
      filename: qrFilename,
      content: qrBuffer,
      cid: qrFilename,
    },
  });

  if (result.sent) {
    console.info(
      `[email:${getEmailProvider()}] Sent seat reservation QR + code to ${params.to} (${params.seatLabel})`,
    );
  }
  return result;
}

export async function sendBookingCancellationEmail(params: {
  to: string;
  studentName: string;
  seatLabel: string;
  startAt: string;
  reason?: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  const html = wrapStudyDockLayout(
    'RESERVATION CANCELLED',
    `DESK ${params.seatLabel} RELEASED`,
    `
      <p style="margin-top:0;font-size:14px;">Hi <strong>${params.studentName}</strong>,</p>
      <p style="font-size:13px;line-height:1.6;">
        Your reservation for desk <strong>${params.seatLabel}</strong> starting <strong>${formatReadable(params.startAt)}</strong> has been cancelled.
      </p>
      ${params.reason ? `<p style="font-size:13px;padding:12px;background:#00312F;border:1px solid rgba(240,237,229,0.3);"><strong>Reason:</strong> ${params.reason}</p>` : ''}
      <p style="font-size:12px;color:rgba(240,237,229,0.75);">The associated QR pass and 6-digit gate code are no longer valid.</p>
    `,
  );

  await dispatchEmail({
    to: params.to,
    subject: `StudyDock Booking Cancelled — Seat ${params.seatLabel}`,
    html,
  });
}

export async function sendBookIssueEmail(params: {
  to: string;
  studentName: string;
  bookTitle: string;
  bookAuthor?: string;
  bookIsbn?: string;
  shelfLocation?: string;
  pickupCode: string;
  pickupExpiresAt: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    console.info(
      `[email:dev] Book pickup email skipped. To=${params.to} Book=${params.bookTitle} Code=${params.pickupCode}`,
    );
    return { sent: false, skipped: true };
  }

  const html = wrapStudyDockLayout(
    'BOOK RESERVATION CONFIRMED',
    'CIRCULATION DESK PICKUP CODE',
    `
      <p style="margin-top:0;font-size:14px;line-height:1.6;">Hi <strong>${params.studentName}</strong>,</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(240,237,229,0.88);">
        You have reserved <strong>${params.bookTitle}</strong> online through StudyDock. Present the unique 6-digit pickup code below at the library circulation desk to collect your volume.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;border-top:1px solid rgba(240,237,229,0.25);border-bottom:1px solid rgba(240,237,229,0.25);">
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Volume</td><td style="padding:8px 0;font-weight:700;text-align:right;">${params.bookTitle}</td></tr>
        ${params.bookAuthor ? `<tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Author</td><td style="padding:8px 0;text-align:right;">${params.bookAuthor}</td></tr>` : ''}
        ${params.shelfLocation ? `<tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Shelf</td><td style="padding:8px 0;text-align:right;font-family:monospace;">${params.shelfLocation}</td></tr>` : ''}
        ${params.bookIsbn ? `<tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">ISBN</td><td style="padding:8px 0;text-align:right;font-family:monospace;">${params.bookIsbn}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Pick Up Before</td><td style="padding:8px 0;text-align:right;">${formatReadable(params.pickupExpiresAt)}</td></tr>
      </table>

      <div style="text-align:center;margin:22px 0;background:#00312F;border:1px solid rgba(240,237,229,0.45);padding:22px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(240,237,229,0.72);">
          UNIQUE 6-DIGIT DESK PICKUP CODE
        </div>
        <div style="font-family:monospace;font-size:38px;font-weight:700;letter-spacing:8px;color:#F0EDE5;margin-top:8px;">
          ${params.pickupCode}
        </div>
      </div>

      <p style="font-size:12px;color:rgba(240,237,229,0.78);margin-bottom:0;">
        If unclaimed before the deadline, the hold automatically expires and returns to the catalog.
      </p>
    `,
  );

  const result = await dispatchEmail({
    to: params.to,
    subject: `StudyDock Book Pickup Code ${params.pickupCode} — ${params.bookTitle}`,
    html,
  });

  if (result.sent) {
    console.info(
      `[email:${getEmailProvider()}] Sent book pickup code to ${params.to} (${params.bookTitle})`,
    );
  }
  return result;
}

export async function sendGroupInviteEmail(params: {
  to: string;
  inviterName: string;
  groupName: string;
  seatLabel: string;
  startAt: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  const html = wrapStudyDockLayout(
    'STUDY SUITE INVITATION',
    params.groupName,
    `
      <p style="margin-top:0;font-size:14px;"><strong>${params.inviterName}</strong> invited you to study in suite <strong>${params.seatLabel}</strong> at <strong>${formatReadable(params.startAt)}</strong>.</p>
      <div style="margin-top:18px;">
        <a href="${getPrimaryClientUrl()}/reservations" style="display:inline-block;background:#F0EDE5;color:#004643;padding:12px 20px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">
          OPEN MY RESERVATIONS →
        </a>
      </div>
    `,
  );

  await dispatchEmail({
    to: params.to,
    subject: `${params.inviterName} invited you to "${params.groupName}" on StudyDock`,
    html,
  });
}

export async function sendTestEmail(to: string): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return {
      sent: false,
      error:
        'Email dispatch is not configured. Set BREVO_API_KEY (recommended on Render Free Tier) or GMAIL_USER + GMAIL_APP_PASSWORD.',
    };
  }

  const html = wrapStudyDockLayout(
    'EMAIL VERIFICATION',
    `DISPATCH ACTIVE (${getEmailProvider().toUpperCase()})`,
    `<p style="margin:0;font-size:14px;line-height:1.6;">StudyDock email notifications are configured and working via <strong>${getEmailProvider()}</strong>. Seat QR passes and book pickup codes will now be delivered automatically.</p>`,
  );

  const result = await dispatchEmail({
    to,
    subject: 'StudyDock — Email Notification Test Successful',
    html,
  });
  return { sent: result.sent, error: result.error };
}
