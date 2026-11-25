import {
  AlertCircle,
  BookPlus,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch, apiFetchCached, getApiCache } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import type { Book, BookIssue } from '../../types';

export function AdminBooks() {
  const [books, setBooks] = useState<Book[]>(
    () => getApiCache<{ books: Book[] }>('/api/books')?.books ?? [],
  );
  const [issues, setIssues] = useState<BookIssue[]>(
    () => getApiCache<{ issues: BookIssue[] }>('/api/books/issues/all')?.issues ?? [],
  );
  const [pickupCode, setPickupCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [shelfLocation, setShelfLocation] = useState('');
  const [description, setDescription] = useState('');

  const loadData = useCallback(async (force = false) => {
    const [bRes, iRes] = await Promise.all([
      apiFetchCached<{ books: Book[] }>('/api/books', { maxAgeMs: 20_000, force }),
      apiFetchCached<{ issues: BookIssue[] }>('/api/books/issues/all', { maxAgeMs: 20_000, force }),
    ]);
    setBooks(bRes.books);
    setIssues(iRes.issues);
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useRealtime(['books'], () => {
    void loadData(true);
  });

  const handleHandover = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ issue: BookIssue }>('/api/books/handover', {
        method: 'POST',
        body: JSON.stringify({ pickupCode }),
      });
      setMessage(`Handover confirmed for "${res.issue.book?.title}".`);
      setPickupCode('');
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handover verification failed.');
    }
  };

  const handleMarkReturned = async (issueId: string) => {
    setError(null);
    try {
      await apiFetch(`/api/books/issues/${issueId}/return`, { method: 'POST' });
      setMessage('Volume returned and marked available in catalogue.');
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark book returned.');
    }
  };

  const handleAddBook = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({
          title,
          author,
          isbn,
          category,
          shelf_location: shelfLocation,
          description,
        }),
      });
      setTitle('');
      setAuthor('');
      setIsbn('');
      setShelfLocation('');
      setDescription('');
      setMessage('Volume added to archive.');
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add book.');
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (!window.confirm('Delete this volume from the archive?')) return;
    try {
      await apiFetch(`/api/books/${id}`, { method: 'DELETE' });
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete book.');
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="pb-5 border-b border-[var(--border-color)]">
          <div className="meta-label">// 03. CIRCULATION DESK &amp; INVENTORY</div>
          <h1 className="font-poster text-4xl sm:text-5xl mt-1">BOOK CIRCULATION</h1>
        </div>

        {message && (
          <div className="p-3.5 border border-emerald-400/70 bg-emerald-500/15 text-xs sm:text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
          </div>
        )}
        {error && (
          <div className="p-3.5 border border-rose-400/70 bg-rose-500/15 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 editorial-card p-6 space-y-4 border-[var(--border-strong)]">
            <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <KeyRound className="h-5 w-5" /> DESK PICKUP HANDOVER
            </h2>
            <form onSubmit={handleHandover} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pickupCode}
                onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-DIGIT PICKUP CODE"
                className="editorial-input text-center font-mono text-2xl font-bold tracking-[0.25em] py-3"
              />
              <button
                type="submit"
                disabled={pickupCode.length !== 6}
                className="btn-slide btn-slide-solid w-full py-3 text-xs"
              >
                VERIFY CODE &amp; HAND OVER →
              </button>
            </form>

            <div className="pt-4 border-t border-[var(--border-color)] space-y-2">
              <h3 className="meta-label">
                ACTIVE LOANS [
                {issues.filter((i) => i.status === 'borrowed' || i.status === 'pending_pickup').length}
                ]
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {issues
                  .filter((i) => i.status === 'borrowed' || i.status === 'pending_pickup')
                  .map((issue) => (
                    <div
                      key={issue.id}
                      className="p-3 border border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold uppercase truncate">{issue.book?.title}</div>
                        <div className="opacity-70 truncate">
                          {issue.student?.full_name} · {issue.status.replace('_', ' ')}
                        </div>
                      </div>
                      {issue.status === 'borrowed' && (
                        <button
                          type="button"
                          onClick={() => void handleMarkReturned(issue.id)}
                          className="btn-slide btn-slide-solid px-2.5 py-1.5 text-[10px] shrink-0"
                        >
                          <RotateCcw className="h-3 w-3" /> RETURN
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 editorial-card p-6 space-y-4">
            <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <BookPlus className="h-5 w-5" /> REGISTER NEW VOLUME
            </h2>
            <form onSubmit={handleAddBook} className="grid sm:grid-cols-2 gap-3 text-sm">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book title"
                className="editorial-input"
              />
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author"
                className="editorial-input"
              />
              <input
                type="text"
                required
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="ISBN (e.g. 978-0132350884)"
                className="editorial-input font-mono"
              />
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category"
                className="editorial-input"
              />
              <input
                type="text"
                value={shelfLocation}
                onChange={(e) => setShelfLocation(e.target.value)}
                placeholder="Shelf call code (e.g. F1-CS-10)"
                className="editorial-input sm:col-span-2 font-mono"
              />
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Editorial synopsis"
                className="editorial-input sm:col-span-2"
              />
              <button type="submit" className="btn-slide btn-slide-solid sm:col-span-2 py-3 text-xs">
                ADD VOLUME TO ARCHIVE →
              </button>
            </form>
          </div>
        </div>

        <div className="editorial-card overflow-hidden">
          <div className="p-4 border-b border-[var(--border-color)] meta-label">
            ARCHIVE INVENTORY [{books.length} VOLUMES]
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
                <tr>
                  <th className="px-4 py-3">VOLUME &amp; AUTHOR</th>
                  <th className="px-4 py-3">ISBN</th>
                  <th className="px-4 py-3">CATEGORY</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3 text-right">REMOVE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {books.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <div className="font-bold uppercase">{b.title}</div>
                      <div className="opacity-70">{b.author}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{b.isbn}</td>
                    <td className="px-4 py-3 uppercase">{b.category}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 border border-[var(--border-strong)] text-[10px] font-bold uppercase">
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={b.status !== 'available'}
                        onClick={() => void handleDeleteBook(b.id)}
                        className="p-1.5 border border-rose-400/60 text-rose-300 hover:bg-rose-600 hover:text-white disabled:opacity-25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
