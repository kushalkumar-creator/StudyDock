import { supabase } from './supabaseClient';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// In-memory SWR cache (never persisted to localStorage) + in-flight request deduplication
const responseCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getApiCache<T>(path: string): T | undefined {
  return responseCache.get(path)?.data as T | undefined;
}

export function invalidateApiCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();
  const authHeader = skipAuth ? {} : await getAuthHeader();

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; message?: string; code?: string };
      message = body.error || body.message || message;
      code = body.code;
    } catch {
      // ignore non-JSON error body
    }
    throw new ApiError(message, response.status, code);
  }

  const json = (await response.json()) as T;

  if (method === 'GET') {
    responseCache.set(path, { data: json, fetchedAt: Date.now() });
  } else {
    // Any mutation invalidates cached read data so views stay consistent
    invalidateApiCache();
  }

  return json;
}

/**
 * Deduplicated GET fetch with optional freshness TTL.
 * Prevents duplicate StrictMode calls and shares concurrent in-flight promises.
 */
export async function apiFetchCached<T>(
  path: string,
  options: { skipAuth?: boolean; maxAgeMs?: number; force?: boolean } = {},
): Promise<T> {
  const { skipAuth = false, maxAgeMs = 15_000, force = false } = options;
  const cached = responseCache.get(path);
  if (!force && cached && Date.now() - cached.fetchedAt < maxAgeMs) {
    return cached.data as T;
  }

  const existingPromise = inFlightRequests.get(path);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const promise = apiFetch<T>(path, { skipAuth }).finally(() => {
    inFlightRequests.delete(path);
  });
  inFlightRequests.set(path, promise);
  return promise;
}

export function prefetchApi(path: string, skipAuth = false): void {
  void apiFetchCached(path, { skipAuth, maxAgeMs: 45_000 }).catch(() => {
    // silent background warmup
  });
}

export async function apiDownloadBlob(path: string, filename: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}${path}`, {
    headers: authHeader,
  });
  if (!response.ok) {
    throw new ApiError('Failed to download file.', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
