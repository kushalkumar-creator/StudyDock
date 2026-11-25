import { Router } from 'express';
import { z } from 'zod';
import { serverCache } from '../lib/cache.js';
import { broadcastUpdate } from '../lib/realtime.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import { sendBookIssueEmail } from '../services/email.js';
import {
  decryptShortCode,
  encryptShortCode,
  generateSixDigitCode,
  hashEntryCode,
} from '../services/signing.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const booksRouter = Router();

const bookBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(160),
  isbn: z.string().trim().min(5).max(32),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional().default(''),
  cover_url: z.string().url().optional().or(z.literal('')).nullable(),
  published_year: z.number().int().min(1400).max(2100).optional().nullable(),
  shelf_location: z.string().trim().max(40).optional().default(''),
  featured_in_hero: z.boolean().optional().default(false),
});

/**
 * GET /api/books (public so visitors on Home hero can browse the catalogue)
 */
booksRouter.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { search, category, status, featured } = req.query as {
      search?: string;
      category?: string;
      status?: string;
      featured?: string;
    };

    const allBooks = await serverCache.getOrSet('books:all', 30_000, async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('featured_in_hero', { ascending: false })
        .order('title');
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    let books = allBooks;
    if (category && category !== 'all') {
      books = books.filter((b) => b.category === category);
    }
    if (status && status !== 'all') {
      books = books.filter((b) => b.status === status);
    }
    if (featured === 'true') {
      books = books.filter((b) => b.featured_in_hero);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      books = books.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q),
      );
    }

    const categories = Array.from(new Set(allBooks.map((b) => b.category))).sort();
    res.json({ books, categories });
  } catch (err) {
    console.error('[books] GET / error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load books.' });
  }
});

/**
 * GET /api/books/mine (student)
 */
booksRouter.get('/mine', verifySupabaseJWT, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('book_issues')
      .select('*, book:books(*)')
      .eq('user_id', req.user!.id)
      .order('issued_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const issues = await Promise.all(
      (data ?? []).map(async (issue) => {
        let pickupCode: string | null = null;
        if (issue.status === 'pending_pickup') {
          pickupCode = decryptShortCode(issue.pickup_code_enc as string | null);
          // Backfill any pending pickup created before pickup_code_enc was added
          if (!pickupCode) {
            const regenerated = generateSixDigitCode();
            const hash = hashEntryCode(regenerated);
            const enc = encryptShortCode(regenerated);
            await supabase
              .from('book_issues')
              .update({ pickup_code_hash: hash, pickup_code_enc: enc })
              .eq('id', issue.id)
              .eq('status', 'pending_pickup');
            pickupCode = regenerated;
          }
        }
        const safe = { ...issue } as Record<string, unknown>;
        delete safe.pickup_code_enc;
        delete safe.pickup_code_hash;
        return { ...safe, pickup_code: pickupCode };
      }),
    );

    res.json({ issues });
  } catch (err) {
    console.error('[books] GET /mine error:', err);
    res.status(500).json({ error: 'Failed to load your issued books.' });
  }
});

/**
 * POST /api/books/:id/issue (student)
 * Online-only book issuing enforcing configurable book_limit (default 1 active book per student).
 */
booksRouter.post(
  '/:id/issue',
  verifySupabaseJWT,
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const bookId = req.params.id;

      const [{ data: settings }, { data: activeIssues }, { data: book }] = await Promise.all([
        supabase.from('settings').select('book_limit, book_pickup_hours').eq('id', 1).single(),
        supabase
          .from('book_issues')
          .select('id, status')
          .eq('user_id', req.user!.id)
          .in('status', ['pending_pickup', 'borrowed']),
        supabase.from('books').select('*').eq('id', bookId).single(),
      ]);

      if (!book) {
        res.status(404).json({ error: 'Book not found.' });
        return;
      }
      if (book.status !== 'available') {
        res.status(409).json({ error: 'This book is currently reserved or borrowed.' });
        return;
      }

      const bookLimit = settings?.book_limit ?? 1;
      if ((activeIssues ?? []).length >= bookLimit) {
        res.status(400).json({
          error: `You can only hold ${bookLimit} active book${bookLimit > 1 ? 's' : ''} at a time. Return your current book first.`,
        });
        return;
      }

      // Atomically claim the book so concurrent issues cannot double-claim
      const { data: claimedBook, error: claimErr } = await supabase
        .from('books')
        .update({ status: 'reserved' })
        .eq('id', bookId)
        .eq('status', 'available')
        .select('*')
        .maybeSingle();

      if (claimErr || !claimedBook) {
        res.status(409).json({ error: 'Book was just issued by another student.' });
        return;
      }

      const pickupHours = settings?.book_pickup_hours ?? 24;
      const pickupCode = generateSixDigitCode();
      const pickupCodeHash = hashEntryCode(pickupCode);
      const pickupCodeEnc = encryptShortCode(pickupCode);
      const pickupExpiresAt = new Date(Date.now() + pickupHours * 3600_000).toISOString();

      const { data: issue, error: issueErr } = await supabase
        .from('book_issues')
        .insert({
          book_id: bookId,
          user_id: req.user!.id,
          pickup_code_hash: pickupCodeHash,
          pickup_code_enc: pickupCodeEnc,
          pickup_expires_at: pickupExpiresAt,
          status: 'pending_pickup',
        })
        .select('*, book:books(*)')
        .single();

      if (issueErr || !issue) {
        // Rollback book status
        await supabase.from('books').update({ status: 'available' }).eq('id', bookId);
        res.status(500).json({ error: issueErr?.message || 'Failed to issue book.' });
        return;
      }

      void sendBookIssueEmail({
        to: req.user!.email,
        studentName: req.user!.full_name || 'Student',
        bookTitle: book.title,
        bookAuthor: book.author,
        bookIsbn: book.isbn,
        shelfLocation: book.shelf_location,
        pickupCode,
        pickupExpiresAt,
      });

      broadcastUpdate(['books']);
      res.status(201).json({
        issue,
        pickupCode,
        pickupExpiresAt,
      });
    } catch (err) {
      console.error('[books] POST /:id/issue error:', err);
      res.status(500).json({ error: 'Failed to issue book.' });
    }
  },
);

/**
 * POST /api/books/issues/:issueId/cancel (student cancels unclaimed pickup)
 */
booksRouter.post(
  '/issues/:issueId/cancel',
  verifySupabaseJWT,
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: issue } = await supabase
        .from('book_issues')
        .select('id, book_id, status')
        .eq('id', req.params.issueId)
        .eq('user_id', req.user!.id)
        .single();

      if (!issue) {
        res.status(404).json({ error: 'Book issue not found.' });
        return;
      }
      if (issue.status !== 'pending_pickup') {
        res.status(400).json({ error: 'Only pending pickup requests can be cancelled.' });
        return;
      }

      await supabase
        .from('book_issues')
        .update({ status: 'cancelled', pickup_code_enc: null })
        .eq('id', issue.id);
      await supabase.from('books').update({ status: 'available' }).eq('id', issue.book_id);
      broadcastUpdate(['books']);
      res.json({ cancelled: true });
    } catch (err) {
      console.error('[books] cancel issue error:', err);
      res.status(500).json({ error: 'Failed to cancel book issue.' });
    }
  },
);

// ===================== ADMIN BOOK & CIRCULATION ROUTES =====================

booksRouter.get(
  '/issues/all',
  verifySupabaseJWT,
  requireRole('admin'),
  async (_req, res) => {
    try {
      const issues = await serverCache.getOrSet('books:issues_all', 20_000, async () => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('book_issues')
          .select(
            '*, book:books(id, title, author, isbn, shelf_location), student:profiles!book_issues_user_id_fkey(id, full_name, email)',
          )
          .order('issued_at', { ascending: false })
          .limit(200);
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      res.json({ issues });
    } catch (err) {
      console.error('[books] GET /issues/all error:', err);
      res.status(500).json({ error: 'Failed to load circulation records.' });
    }
  },
);

booksRouter.post(
  '/handover',
  verifySupabaseJWT,
  requireRole('admin'),
  async (req, res) => {
    try {
      const schema = z
        .object({
          pickupCode: z.string().regex(/^\d{6}$/).optional(),
          issueId: z.string().uuid().optional(),
        })
        .refine((v) => v.pickupCode || v.issueId, {
          message: 'Provide pickupCode or issueId.',
        });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide a valid 6-digit pickup code or issueId.' });
        return;
      }

      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('book_issues')
        .select('*, book:books(*), student:profiles!book_issues_user_id_fkey(full_name, email)')
        .eq('status', 'pending_pickup');

      if (parsed.data.issueId) {
        query = query.eq('id', parsed.data.issueId);
      } else if (parsed.data.pickupCode) {
        query = query.eq('pickup_code_hash', hashEntryCode(parsed.data.pickupCode));
      }

      const { data: issue } = await query.maybeSingle();
      if (!issue) {
        res.status(404).json({ error: 'No pending book pickup matches that code.' });
        return;
      }

      if (Date.parse(issue.pickup_expires_at) < Date.now()) {
        await supabase.from('book_issues').update({ status: 'expired' }).eq('id', issue.id);
        await supabase.from('books').update({ status: 'available' }).eq('id', issue.book_id);
        res.status(410).json({ error: 'Pickup window expired. Book has been returned to catalogue.' });
        return;
      }

      const { data: settings } = await supabase
        .from('settings')
        .select('book_loan_days')
        .eq('id', 1)
        .single();
      const loanDays = settings?.book_loan_days ?? 14;
      const now = new Date();
      const dueAt = new Date(now.getTime() + loanDays * 86_400_000).toISOString();

      const { data: updated, error: updErr } = await supabase
        .from('book_issues')
        .update({
          status: 'borrowed',
          picked_up_at: now.toISOString(),
          due_at: dueAt,
          pickup_code_enc: null,
        })
        .eq('id', issue.id)
        .eq('status', 'pending_pickup')
        .select('*, book:books(*), student:profiles!book_issues_user_id_fkey(full_name, email)')
        .single();

      if (updErr || !updated) {
        res.status(409).json({ error: 'Could not confirm handover.' });
        return;
      }

      await supabase.from('books').update({ status: 'borrowed' }).eq('id', issue.book_id);
      broadcastUpdate(['books']);
      res.json({ issue: updated });
    } catch (err) {
      console.error('[books] POST /handover error:', err);
      res.status(500).json({ error: 'Failed to confirm handover.' });
    }
  },
);

booksRouter.post(
  '/issues/:issueId/return',
  verifySupabaseJWT,
  requireRole('admin'),
  async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: issue } = await supabase
        .from('book_issues')
        .select('id, book_id, status')
        .eq('id', req.params.issueId)
        .single();

      if (!issue) {
        res.status(404).json({ error: 'Issue record not found.' });
        return;
      }
      if (issue.status !== 'borrowed') {
        res.status(400).json({ error: 'Only currently borrowed books can be marked returned.' });
        return;
      }

      const { data: updated, error } = await supabase
        .from('book_issues')
        .update({
          status: 'returned',
          returned_at: new Date().toISOString(),
        })
        .eq('id', issue.id)
        .select('*')
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      await supabase.from('books').update({ status: 'available' }).eq('id', issue.book_id);
      broadcastUpdate(['books']);
      res.json({ issue: updated });
    } catch (err) {
      console.error('[books] POST return error:', err);
      res.status(500).json({ error: 'Failed to mark book returned.' });
    }
  },
);

booksRouter.post('/', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  try {
    const parsed = bookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid book details.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('books')
      .insert({
        ...parsed.data,
        cover_url: parsed.data.cover_url || null,
        status: 'available',
      })
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    broadcastUpdate(['books']);
    res.status(201).json({ book: data });
  } catch (err) {
    console.error('[books] POST / error:', err);
    res.status(500).json({ error: 'Failed to add book.' });
  }
});

booksRouter.patch('/:id', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  try {
    const parsed = bookBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update data.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('books')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    broadcastUpdate(['books']);
    res.json({ book: data });
  } catch (err) {
    console.error('[books] PATCH /:id error:', err);
    res.status(500).json({ error: 'Failed to update book.' });
  }
});

booksRouter.delete('/:id', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: book } = await supabase
      .from('books')
      .select('id, status')
      .eq('id', req.params.id)
      .single();

    if (!book) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }
    if (book.status !== 'available') {
      res.status(400).json({ error: 'Cannot delete a book that is currently reserved or borrowed.' });
      return;
    }

    const { error } = await supabase.from('books').delete().eq('id', req.params.id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    broadcastUpdate(['books']);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[books] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
});
