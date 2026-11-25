import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    return typeof window !== 'undefined' && window.localStorage.getItem('pwa-dismissed') === '1';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    window.localStorage.setItem('pwa-dismissed', '1');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm editorial-card p-4 flex items-center gap-3 border-[var(--border-strong)] shadow-2xl">
      <div className="h-10 w-10 border border-[var(--border-strong)] flex items-center justify-center shrink-0">
        <Download className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold tracking-[0.12em] uppercase">INSTALL STUDYDOCK</p>
        <p className="text-xs opacity-75 mt-0.5">Instant seat booking &amp; QR gate passes.</p>
      </div>
      <button
        type="button"
        onClick={handleInstall}
        className="btn-slide btn-slide-solid px-3 py-1.5 text-[11px]"
      >
        INSTALL
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
