import type { Request, Response } from 'express';
import { serverCache } from './cache.js';

export type RealtimeTopic = 'bookings' | 'seats' | 'books' | 'announcements' | 'settings';

const clients = new Set<Response>();

/**
 * Registers an SSE client connection for sub-second real-time UI updates across
 * all open student and admin browser tabs.
 */
export function handleSseConnection(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
  clients.add(res);

  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      clients.delete(res);
      return;
    }
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

/**
 * Invalidates relevant server caches immediately and pushes a real-time SSE event
 * to every connected student & admin tab.
 */
export function broadcastUpdate(topics: RealtimeTopic[]): void {
  const unique = Array.from(new Set(topics));

  if (unique.includes('seats') || unique.includes('bookings')) {
    serverCache.invalidate('layout:');
    serverCache.invalidate('seats:');
    serverCache.invalidate('dashboard:');
    serverCache.invalidate('admin:');
  }
  if (unique.includes('books')) {
    serverCache.invalidate('books:');
    serverCache.invalidate('dashboard:');
    serverCache.invalidate('admin:');
  }
  if (unique.includes('announcements') || unique.includes('settings')) {
    serverCache.invalidate('dashboard:');
    serverCache.invalidate('admin:');
  }

  if (clients.size === 0) return;

  const payload = `event: update\ndata: ${JSON.stringify({ topics: unique, ts: Date.now() })}\n\n`;
  for (const res of clients) {
    if (res.writableEnded) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}
