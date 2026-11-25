import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import type { GateVerifyResult } from '../types/index.js';

export interface EntryTokenPayload {
  bookingId: string;
  seatId: string;
  startISO: string;
  endISO: string;
}

export interface VerifiedEntryToken extends EntryTokenPayload {
  valid: true;
  signature: string;
}

/**
 * Generates a cryptographically random 6-digit numeric entry or pickup code.
 */
export function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes a keyed HMAC-SHA256 hash of a 6-digit code so it is never stored in plaintext.
 */
export function hashEntryCode(code: string, secret = env.entryCodeSecret): string {
  return crypto.createHmac('sha256', secret).update(code.trim()).digest('hex');
}

/**
 * Encrypts a short pickup/entry code with AES-256-GCM so only the server can reveal it back
 * to the owning authenticated student while pending.
 */
export function encryptShortCode(code: string, secret = env.entryCodeSecret): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(code.trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptShortCode(payload: string | null | undefined, secret = env.entryCodeSecret): string | null {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Builds an HMAC-SHA256 signed token bound to booking, seat, start, and end timestamps.
 * Format: base64url(bookingId.seatId.startISO.endISO).hmacHex
 */
export function createSignedEntryToken(
  payload: EntryTokenPayload,
  secret = env.entryCodeSecret,
): { token: string; signature: string } {
  const canonical = `${payload.bookingId}.${payload.seatId}.${payload.startISO}.${payload.endISO}`;
  const encodedPayload = Buffer.from(canonical, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    token: `${encodedPayload}.${signature}`,
    signature,
  };
}

/**
 * Verifies a signed QR entry token using constant-time comparison.
 */
export function verifySignedEntryToken(
  token: string,
  secret = env.entryCodeSecret,
): VerifiedEntryToken | { valid: false } {
  if (!token || typeof token !== 'string') return { valid: false };
  const trimmed = token.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return { valid: false };

  const encodedPayload = trimmed.slice(0, dotIndex);
  const providedSig = trimmed.slice(dotIndex + 1);
  if (!/^[a-f0-9]{64}$/i.test(providedSig)) return { valid: false };

  let canonical: string;
  try {
    canonical = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return { valid: false };
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  const providedBuf = Buffer.from(providedSig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false };
  }

  // Canonical format: bookingId.seatId.startISO.endISO
  // Note: ISO timestamps contain ".000Z", so split with care: first two dots separate UUIDs, then split remainder on `.`?
  // Safer: UUIDs never contain dots, so indexOf('.', 0) and next indexOf('.', ...) isolate bookingId and seatId;
  // then startISO ends with 'Z' or offset, and we can locate `.` right after 'Z' or split on ISO separator.
  // Actually let's parse reliably by splitting bookingId (pos 0), seatId (pos 1), then finding the boundary between two ISO strings!
  const firstDot = canonical.indexOf('.');
  if (firstDot === -1) return { valid: false };
  const secondDot = canonical.indexOf('.', firstDot + 1);
  if (secondDot === -1) return { valid: false };

  const bookingId = canonical.slice(0, firstDot);
  const seatId = canonical.slice(firstDot + 1, secondDot);
  const timesPart = canonical.slice(secondDot + 1);

  // Match two ISO-8601 strings joined by a dot
  const isoBoundary = timesPart.search(/\.(\d{4}-\d{2}-\d{2}T)/);
  if (isoBoundary === -1) return { valid: false };

  const startISO = timesPart.slice(0, isoBoundary);
  const endISO = timesPart.slice(isoBoundary + 1);

  if (!bookingId || !seatId || Number.isNaN(Date.parse(startISO)) || Number.isNaN(Date.parse(endISO))) {
    return { valid: false };
  }

  return {
    valid: true,
    bookingId,
    seatId,
    startISO,
    endISO,
    signature: expectedSig,
  };
}

/**
 * Evaluates whether `now` falls inside the allowed gate entry window.
 * Early entry is allowed up to `earlyEntryMin` minutes before `startAt`.
 */
export function evaluateEntryWindow(
  startAt: Date,
  endAt: Date,
  now: Date,
  earlyEntryMin: number,
): Extract<GateVerifyResult, 'VALID' | 'TOO EARLY' | 'EXPIRED'> {
  const earliestAllowed = new Date(startAt.getTime() - earlyEntryMin * 60_000);
  if (now.getTime() < earliestAllowed.getTime()) {
    return 'TOO EARLY';
  }
  if (now.getTime() > endAt.getTime()) {
    return 'EXPIRED';
  }
  return 'VALID';
}

export async function generateQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export async function generateQrPngBuffer(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
