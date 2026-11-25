import nodemailer, { type Transporter } from 'nodemailer';
import { env, isEmailConfigured } from '../config/env.js';
import { generateQrPngBuffer } from './signing.js';
import { buildGoogleCalendarUrl } from './validation.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.gmailUser.trim(),
        // Strip spaces automatically in case the 16-char Google App Password was pasted with spaces
        pass: env.gmailAppPassword.replace(/\s+/g, ''),
      },
    });
  }
  return transporter;
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
  const mailer = getTransporter();
  if (!mailer) {
    console.info(
      `[email:dev] Seat confirmation skipped (set GMAIL_USER & GMAIL_APP_PASSWORD in server/.env). To=${params.to} Seat=${params.seatLabel} Code=${params.sixDigitCode}`,
    );
    return { sent: false, skipped: true };
  }

  try {
    const qrBuffer = await generateQrPngBuffer(params.signedToken);
    const gcalUrl = buildGoogleCalendarUrl({
      title: `StudyDock Seat ${params.seatLabel} (${params.floorName})`,
      details: `Unique 6-digit gate code: ${params.sixDigitCode}. Present your QR code at the library gate.`,
      location: `${params.floorName} — ${params.section}, Seat ${params.seatLabel}`,
      startAt: new Date(params.startAt),
      endAt: new Date(params.endAt),
    });

    const html = wrapStudyDockLayout(
      'SEAT RESERVATION CONFIRMED',
      `DESK ${params.seatLabel} // ENTRY PASS`,
      `
        <p style="margin-top:0;font-size:14px;line-height:1.6;">Hi <strong>${params.studentName}</strong>,</p>
        <p style="font-size:13px;line-height:1.6;color:rgba(240,237,229,0.88);">
          Your reading desk is confirmed. Show the <strong>signed QR code</strong> or enter your <strong>unique 6-digit gate code</strong> at the entrance. Entry opens 15 minutes before start time and auto-releases if unclaimed after 15 minutes.
        </p>

        <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;border-top:1px solid rgba(240,237,229,0.25);border-bottom:1px solid rgba(240,237,229,0.25);">
          <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Desk</td><td style="padding:8px 0;font-weight:700;text-align:right;font-family:monospace;">${params.seatLabel}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Location</td><td style="padding:8px 0;text-align:right;">${params.floorName} · ${params.section}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">Start</td><td style="padding:8px 0;text-align:right;">${formatReadable(params.startAt)}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(240,237,229,0.72);text-transform:uppercase;font-size:11px;letter-spacing:1.2px;">End</td><td style="padding:8px 0;text-align:right;">${formatReadable(params.endAt)}</td></tr>
        </table>

        <div style="text-align:center;margin:22px 0;background:#00312F;border:1px solid rgba(240,237,229,0.45);padding:22px;">
          <div style="display:inline-block;background:#F0EDE5;padding:12px;">
            <img src="cid:entry-qr" alt="StudyDock Gate QR Code" style="width:210px;height:210px;display:block;" />
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

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: `StudyDock Seat ${params.seatLabel} Confirmed — Code ${params.sixDigitCode}`,
      html,
      attachments: [
        {
          filename: `studydock-seat-${params.seatLabel}-qr.png`,
          content: qrBuffer,
          cid: 'entry-qr',
        },
      ],
    });
    console.info(`[email] Sent seat reservation QR + code to ${params.to} (${params.seatLabel})`);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Failed to send seat confirmation:', message);
    return { sent: false, error: message };
  }
}

export async function sendBookingCancellationEmail(params: {
  to: string;
  studentName: string;
  seatLabel: string;
  startAt: string;
  reason?: string;
}): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[email:dev] Cancellation email skipped for ${params.to} (${params.seatLabel}).`);
    return;
  }
  try {
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

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: `StudyDock Booking Cancelled — Seat ${params.seatLabel}`,
      html,
    });
  } catch (err) {
    console.error('[email] Cancellation email error:', err);
  }
}

export async function sendBookingReminderEmail(params: {
  to: string;
  studentName: string;
  seatLabel: string;
  floorName: string;
  startAt: string;
}): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[email:dev] Reminder email skipped for ${params.to} (${params.seatLabel}).`);
    return;
  }
  try {
    const html = wrapStudyDockLayout(
      'SESSION REMINDER',
      `DESK ${params.seatLabel} STARTS SOON`,
      `
        <p style="margin-top:0;font-size:14px;">Hi <strong>${params.studentName}</strong>,</p>
        <p style="font-size:13px;line-height:1.6;">
          Your reservation for <strong>${params.seatLabel}</strong> (${params.floorName}) begins at <strong>${formatReadable(params.startAt)}</strong>.
        </p>
        <p style="font-size:13px;line-height:1.6;">
          Please check in at the gate with your QR pass or 6-digit code within 15 minutes of start time to avoid automatic no-show release.
        </p>
      `,
    );

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: `Reminder: StudyDock Seat ${params.seatLabel} starts soon`,
      html,
    });
  } catch (err) {
    console.error('[email] Reminder email error:', err);
  }
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
  const mailer = getTransporter();
  if (!mailer) {
    console.info(
      `[email:dev] Book pickup email skipped (set GMAIL_USER & GMAIL_APP_PASSWORD in server/.env). To=${params.to} Book=${params.bookTitle} Code=${params.pickupCode}`,
    );
    return { sent: false, skipped: true };
  }
  try {
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

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: `StudyDock Book Pickup Code ${params.pickupCode} — ${params.bookTitle}`,
      html,
    });
    console.info(`[email] Sent book pickup code to ${params.to} (${params.bookTitle})`);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Failed to send book pickup email:', message);
    return { sent: false, error: message };
  }
}

export async function sendGroupInviteEmail(params: {
  to: string;
  inviterName: string;
  groupName: string;
  seatLabel: string;
  startAt: string;
}): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[email:dev] Group invite skipped for ${params.to} (${params.groupName}).`);
    return;
  }
  try {
    const html = wrapStudyDockLayout(
      'STUDY SUITE INVITATION',
      params.groupName,
      `
        <p style="margin-top:0;font-size:14px;"><strong>${params.inviterName}</strong> invited you to study in suite <strong>${params.seatLabel}</strong> at <strong>${formatReadable(params.startAt)}</strong>.</p>
        <div style="margin-top:18px;">
          <a href="${env.clientUrl}/reservations" style="display:inline-block;background:#F0EDE5;color:#004643;padding:12px 20px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">
            OPEN MY RESERVATIONS →
          </a>
        </div>
      `,
    );

    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to: params.to,
      subject: `${params.inviterName} invited you to "${params.groupName}" on StudyDock`,
      html,
    });
  } catch (err) {
    console.error('[email] Group invite email error:', err);
  }
}

export async function sendTestEmail(to: string): Promise<{ sent: boolean; error?: string }> {
  const mailer = getTransporter();
  if (!mailer) {
    return {
      sent: false,
      error: 'Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env.',
    };
  }
  try {
    const html = wrapStudyDockLayout(
      'SMTP VERIFICATION',
      'GMAIL DISPATCH ACTIVE',
      `<p style="margin:0;font-size:14px;line-height:1.6;">StudyDock Gmail notifications are configured and working. Seat QR passes and book pickup codes will now be delivered automatically.</p>`,
    );
    await mailer.sendMail({
      from: `"StudyDock Library" <${env.gmailUser.trim()}>`,
      to,
      subject: 'StudyDock — Gmail Notification Test Successful',
      html,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
