import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../hooks/useAuth';
import { apiFetch, apiFetchCached, getApiCache } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import type { Book, BookIssue } from '../types';

export function Books() {
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const cachedCatalog = getApiCache<{ books: Book[]; categories: string[] }>('/api/books');
  const cachedMine = getApiCache<{ issues: BookIssue[] }>('/api/books/mine');

  const [allBooks, setAllBooks] = useState<Book[]>(cachedCatalog?.books ?? []);
  const [categories, setCategories] = useState<string[]>(cachedCatalog?.categories ?? []);
  const [myIssues, setMyIssues] = useState<BookIssue[]>(cachedMine?.issues ?? []);
  const [loading, setLoading] = useState(!cachedCatalog);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickupModal, setPickupModal] = useState<{
    bookTitle: string;
    pickupCode: string;
    pickupExpiresAt: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyPickupCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const loadBooks = useCallback(
    async (force = false) => {
      try {
        if (!getApiCache('/api/books')) setLoading(true);
        const [catalogRes, mineRes] = await Promise.all([
          apiFetchCached<{ books: Book[]; categories: string[] }>('/api/books', {
            skipAuth: true,
            maxAgeMs: 30_000,
            force,
          }),
          user && role === 'student'
            ? apiFetchCached<{ issues: BookIssue[] }>('/api/books/mine', {
                maxAgeMs: 20_000,
                force,
              })
            : Promise.resolve(null),
        ]);
        setAllBooks(catalogRes.books);
        setCategories(catalogRes.categories);
        if (mineRes) setMyIssues(mineRes.issues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load book catalogue.');
      } finally {
        setLoading(false);
      }
    },
    [user, role],
  );

  useEffect(() => {
    void loadBooks(false);
  }, [loadBooks]);

  useRealtime(['books'], () => {
    void loadBooks(true);
  });

  // 0ms client-side filtering — zero network requests when typing or switching filters
  const books = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allBooks.filter((b) => {
      if (category !== 'all' && b.category !== category) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (
        q &&
        !b.title.toLowerCase().includes(q) &&
        !b.author.toLowerCase().includes(q) &&
        !b.isbn.toLowerCase().includes(q) &&
        !b.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allBooks, search, category, statusFilter]);

  const handleIssueBook = async (book: Book) => {
    setError(null);
    setIssuingId(book.id);
    try {
      const res = await apiFetch<{
        issue: BookIssue;
        pickupCode: string;
        pickupExpiresAt: string;
      }>(`/api/books/${book.id}/issue`, { method: 'POST' });

      setPickupModal({
        bookTitle: book.title,
        pickupCode: res.pickupCode,
        pickupExpiresAt: res.pickupExpiresAt,
      });
      await loadBooks(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue book.');
    } finally {
      setIssuingId(null);
    }
  };

  const handleCancelIssue = async (issueId: string) => {
    try {
      await apiFetch(`/api/books/issues/${issueId}/cancel`, { method: 'POST' });
      await loadBooks(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel pickup request.');
    }
  };

  const activeIssue = myIssues.find((i) => i.status === 'pending_pickup' || i.status === 'borrowed');

  return (
    <AppShell showSidebar={Boolean(user)}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label">// ONLINE-ONLY CIRCULATION ARCHIVE</div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1">LIBRARY BOOK CATALOG</h1>
          </div>
          {!user && (
            <Link to="/login" className="self-start btn-slide btn-slide-solid px-4 py-2.5 text-xs">
              SIGN IN TO ISSUE VOLUMES →
            </Link>
          )}
        </div>

        {activeIssue && (
          <div className="editorial-card border-[var(--border-strong)] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 border border-[var(--border-strong)] flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="meta-label">
                  YOUR ACTIVE VOLUME // {activeIssue.status.replace('_', ' ')}
                </div>
                <div className="font-sans font-bold text-lg leading-snug mt-0.5">
                  {activeIssue.book?.title}
                </div>
                <div className="text-xs opacity-75 flex items-center gap-1.5 mt-0.5 font-mono">
                  <Clock className="h-3.5 w-3.5" />
                  {activeIssue.status === 'pending_pickup'
                    ? `PICK UP BEFORE ${new Date(activeIssue.pickup_expires_at).toLocaleString()}`
                    : activeIssue.due_at
                      ? `DUE BACK ${new Date(activeIssue.due_at).toLocaleDateString()}`
                      : 'CHECKED OUT'}
                </div>
              </div>
            </div>
            {activeIssue.status === 'pending_pickup' && (
              <div className="flex flex-wrap items-center gap-2.5">
                {activeIssue.pickup_code && (
                  <button
                    type="button"
                    onClick={() =>
                      setPickupModal({
                        bookTitle: activeIssue.book?.title || 'Reserved Volume',
                        pickupCode: activeIssue.pickup_code!,
                        pickupExpiresAt: activeIssue.pickup_expires_at,
                      })
                    }
                    className="btn-slide px-3.5 py-2 text-xs"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    VIEW CODE
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleCancelIssue(activeIssue.id)}
                  className="btn-slide px-3.5 py-2 text-xs"
                >
                  CANCEL HOLD
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3.5 border border-rose-400/70 bg-rose-500/15 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="editorial-card p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 opacity-60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (searchParams.get('search')) setSearchParams({});
              }}
              placeholder="Search title, author, ISBN, or subject…"
              className="editorial-input pl-11"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="editorial-input md:w-52 uppercase text-xs font-bold tracking-wider"
          >
            <option value="all">ALL CATEGORIES</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="editorial-input md:w-44 uppercase text-xs font-bold tracking-wider"
          >
            <option value="all">ALL STATUS</option>
            <option value="available">AVAILABLE</option>
            <option value="reserved">RESERVED</option>
            <option value="borrowed">BORROWED</option>
          </select>
        </div>

        {/* Catalogue Grid */}
        {loading ? (
          <div className="editorial-card p-12 text-center meta-label">LOADING ARCHIVE VOLUMES…</div>
        ) : books.length === 0 ? (
          <div className="editorial-card p-12 text-center meta-label">
            NO VOLUMES MATCHED YOUR QUERY
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {books.map((book) => (
              <article
                key={book.id}
                className="editorial-card editorial-card-interactive overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="h-40 bg-[#00312F] relative overflow-hidden border-b border-[var(--border-color)]">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover opacity-75 grayscale-[25%]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-10 w-10 opacity-30" />
                      </div>
                    )}
                    <span className="absolute top-3 right-3 px-2.5 py-1 bg-[var(--marquee-bg)] text-[var(--marquee-text)] text-[10px] font-bold uppercase tracking-[0.16em]">
                      {book.status}
                    </span>
                    <span className="absolute bottom-2 left-3 px-2 py-0.5 bg-black/65 text-[#F0EDE5] font-mono text-[10px] uppercase tracking-wider">
                      {book.shelf_location || 'MAIN ARCHIVE'}
                    </span>
                  </div>

                  <div className="p-5 space-y-2.5">
                    <div className="meta-label">
                      {book.category} {book.published_year ? `// ${book.published_year}` : ''}
                    </div>
                    <h2 className="font-sans text-lg font-bold leading-snug tracking-tight">
                      {book.title}
                    </h2>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
                      {book.author}
                    </p>
                    <p className="text-xs leading-relaxed opacity-80 line-clamp-2 pt-1">
                      {book.description}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 flex items-center justify-between gap-2 border-t border-[var(--border-color)]">
                  <span className="font-mono text-[10px] opacity-65">ISBN {book.isbn}</span>
                  {role === 'student' ? (
                    <button
                      type="button"
                      disabled={
                        book.status !== 'available' || Boolean(activeIssue) || issuingId === book.id
                      }
                      onClick={() => void handleIssueBook(book)}
                      className="btn-slide btn-slide-solid px-3.5 py-1.5 text-[11px]"
                    >
                      {issuingId === book.id
                        ? 'ISSUING…'
                        : book.status !== 'available'
                          ? 'UNAVAILABLE'
                          : activeIssue
                            ? 'LIMIT 1 BOOK'
                            : 'ISSUE ONLINE →'}
                    </button>
                  ) : !user ? (
                    <Link
                      to="/login"
                      className="text-[11px] font-bold uppercase tracking-[0.14em] underline underline-offset-4"
                    >
                      SIGN IN TO ISSUE →
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Pickup Code Modal */}
      {pickupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="editorial-card border-[var(--border-strong)] w-full max-w-md p-6 text-center space-y-4">
            <div className="flex justify-end">
              <button type="button" onClick={() => setPickupModal(null)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CheckCircle2 className="h-10 w-10 mx-auto" />
            <h2 className="font-poster text-3xl">VOLUME HELD FOR PICKUP</h2>
            <p className="text-xs opacity-85">
              Present this 6-digit circulation code at the desk for{' '}
              <strong className="uppercase">{pickupModal.bookTitle}</strong>.
            </p>
            <div className="p-4 border border-[var(--border-strong)] bg-[var(--bg-primary)] space-y-3">
              <div className="meta-label flex items-center justify-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> DESK PICKUP CODE
              </div>
              <div className="font-mono text-4xl font-bold tracking-[0.28em]">
                {pickupModal.pickupCode}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyPickupCode(pickupModal.pickupCode)}
                className="btn-slide btn-slide-solid px-4 py-2 text-xs mx-auto"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> COPIED TO CLIPBOARD
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> COPY CODE
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] font-mono opacity-75">
              HOLD EXPIRES {new Date(pickupModal.pickupExpiresAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
