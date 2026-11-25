import { describe, expect, it } from 'vitest';
import {
  createSignedEntryToken,
  evaluateEntryWindow,
  generateSixDigitCode,
  hashEntryCode,
  verifySignedEntryToken,
} from '../src/services/signing.js';

describe('Entry Code Signing & Time Windows', () => {
  const secret = 'test-super-secret-hmac-key-for-library-12345';

  it('generates valid 6-digit codes and consistent keyed hashes', () => {
    const code = generateSixDigitCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashEntryCode(code, secret)).toBe(hashEntryCode(code, secret));
    expect(hashEntryCode(code, secret)).not.toBe(hashEntryCode(code, 'other-secret'));
  });

  it('signs and verifies an entry token bound to booking, seat, start, and end', () => {
    const payload = {
      bookingId: '11111111-1111-4111-8111-111111111111',
      seatId: '22222222-2222-4222-8222-222222222222',
      startISO: '2026-11-26T04:30:00.000Z',
      endISO: '2026-11-26T06:30:00.000Z',
    };

    const { token, signature } = createSignedEntryToken(payload, secret);
    const verified = verifySignedEntryToken(token, secret);

    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.bookingId).toBe(payload.bookingId);
      expect(verified.seatId).toBe(payload.seatId);
      expect(verified.startISO).toBe(payload.startISO);
      expect(verified.endISO).toBe(payload.endISO);
      expect(verified.signature).toBe(signature);
    }
  });

  it('rejects forged, tampered, or wrong-secret tokens', () => {
    const { token } = createSignedEntryToken(
      {
        bookingId: '11111111-1111-4111-8111-111111111111',
        seatId: '22222222-2222-4222-8222-222222222222',
        startISO: '2026-11-26T04:30:00.000Z',
        endISO: '2026-11-26T06:30:00.000Z',
      },
      secret,
    );

    // Wrong secret
    expect(verifySignedEntryToken(token, 'wrong-secret').valid).toBe(false);

    // Tampered payload
    const [payloadPart, sigPart] = token.split('.');
    const tamperedPayload = Buffer.from(
      '11111111-1111-4111-8111-111111111111.99999999-9999-4999-8999-999999999999.2026-11-26T04:30:00.000Z.2026-11-26T06:30:00.000Z',
    ).toString('base64url');
    expect(verifySignedEntryToken(`${tamperedPayload}.${sigPart}`, secret).valid).toBe(false);

    // Tampered signature
    const badSig = (sigPart[0] === 'a' ? 'b' : 'a') + sigPart.slice(1);
    expect(verifySignedEntryToken(`${payloadPart}.${badSig}`, secret).valid).toBe(false);
  });

  it('evaluates TOO EARLY, VALID, and EXPIRED windows accurately', () => {
    const start = new Date('2026-11-26T10:00:00.000Z');
    const end = new Date('2026-11-26T12:00:00.000Z');

    // 20 min before start -> TOO EARLY (earlyEntryMin = 15)
    expect(evaluateEntryWindow(start, end, new Date('2026-11-26T09:40:00.000Z'), 15)).toBe(
      'TOO EARLY',
    );
    // 10 min before start -> VALID
    expect(evaluateEntryWindow(start, end, new Date('2026-11-26T09:50:00.000Z'), 15)).toBe('VALID');
    // During session -> VALID
    expect(evaluateEntryWindow(start, end, new Date('2026-11-26T11:00:00.000Z'), 15)).toBe('VALID');
    // 1 min after end -> EXPIRED
    expect(evaluateEntryWindow(start, end, new Date('2026-11-26T12:01:00.000Z'), 15)).toBe(
      'EXPIRED',
    );
  });
});
