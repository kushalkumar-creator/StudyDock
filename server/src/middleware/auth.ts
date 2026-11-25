import crypto from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { serverCache } from '../lib/cache.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import type { AuthenticatedRequest, UserProfile, UserRole } from '../types/index.js';

const AUTH_CACHE_TTL_MS = 60_000;

function getJwtRemainingMs(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return AUTH_CACHE_TTL_MS;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: number;
    };
    if (!payload.exp) return AUTH_CACHE_TTL_MS;
    return Math.max(0, payload.exp * 1000 - Date.now());
  } catch {
    return AUTH_CACHE_TTL_MS;
  }
}

export async function verifySupabaseJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header.' });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Empty bearer token.' });
      return;
    }

    // Fast path: cached verified profile for this exact access token (max 60s, bounded by JWT exp)
    const tokenKey = `auth:${crypto.createHash('sha256').update(token).digest('hex')}`;
    const cachedProfile = serverCache.get<UserProfile>(tokenKey);
    if (cachedProfile) {
      req.user = cachedProfile;
      req.accessToken = token;
      next();
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      const fallbackName =
        (authData.user.user_metadata?.full_name as string | undefined) ||
        (authData.user.user_metadata?.name as string | undefined) ||
        (authData.user.email?.split('@')[0] ?? 'Student');

      const { data: created, error: createError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: authData.user.id,
            email: authData.user.email ?? '',
            full_name: fallbackName,
            role: 'student',
            avatar_url: (authData.user.user_metadata?.avatar_url as string | undefined) ?? null,
          },
          { onConflict: 'id' },
        )
        .select('id, full_name, email, role, avatar_url')
        .single();

      if (createError || !created) {
        res.status(403).json({ error: 'User profile could not be loaded.' });
        return;
      }

      const ttl = Math.min(AUTH_CACHE_TTL_MS, getJwtRemainingMs(token));
      if (ttl > 1000) serverCache.set(tokenKey, created as UserProfile, ttl);
      req.user = created as UserProfile;
      req.accessToken = token;
      next();
      return;
    }

    const ttl = Math.min(AUTH_CACHE_TTL_MS, getJwtRemainingMs(token));
    if (ttl > 1000) serverCache.set(tokenKey, profile as UserProfile, ttl);
    req.user = profile as UserProfile;
    req.accessToken = token;
    next();
  } catch (err) {
    console.error('[auth] JWT verification error:', err);
    res.status(500).json({ error: 'Authentication service unavailable.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}
