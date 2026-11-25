import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function QRScanner({
  onScan,
  disabled = false,
}: {
  onScan: (decodedText: string) => void;
  disabled?: boolean;
}) {
  const rawId = useId();
  const containerId = `qr-reader-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const disabledRef = useRef(disabled);
  onScanRef.current = onScan;
  disabledRef.current = disabled;

  const lastScannedRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [status, setStatus] = useState<'idle' | 'starting' | 'active'>('idle');
  const [error, setError] = useState<string | null>(null);

  const stopCamera = async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    try {
      if (instance && instance.isScanning) {
        await instance.stop();
      }
      instance?.clear();
    } catch {
      // ignore cleanup errors
    } finally {
      setStatus('idle');
    }
  };

  const startCamera = async () => {
    setError(null);
    setStatus('starting');

    try {
      await stopCamera();
      setStatus('starting');

      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.5,
      };

      const handleDecode = (decodedText: string) => {
        if (disabledRef.current) return;
        const now = Date.now();
        if (
          lastScannedRef.current.text === decodedText &&
          now - lastScannedRef.current.at < 3000
        ) {
          return;
        }
        lastScannedRef.current = { text: decodedText, at: now };
        onScanRef.current(decodedText);
      };

      const ignoreMiss = () => {
        // Ignore per-frame decode misses
      };

      try {
        // Prefer rear camera on mobile
        await scanner.start({ facingMode: 'environment' }, config, handleDecode, ignoreMiss);
      } catch {
        // Fallback for desktop / laptop webcams that don't expose an environment camera
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('No camera device detected on this machine.');
        }
        await scanner.start(cameras[0].id, config, handleDecode, ignoreMiss);
      }

      setStatus('active');
    } catch (err) {
      await stopCamera();
      setError(
        err instanceof Error
          ? `Camera unavailable: ${err.message}. You can still use the 6-digit manual code on the right.`
          : 'Camera permission denied. Use the 6-digit manual code on the right.',
      );
    }
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Scanner viewport: dedicated empty mount container + sibling overlay so React & html5-qrcode never collide */}
      <div className="relative w-full min-h-[300px] overflow-hidden bg-[#00312F] border border-[var(--border-strong)] flex items-center justify-center">
        {/* html5-qrcode exclusively owns this empty div */}
        <div
          id={containerId}
          className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
        />

        {status !== 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-[#F0EDE5]/80 pointer-events-none gap-2.5 bg-[#00312F]">
            {status === 'starting' ? (
              <>
                <RefreshCw className="h-8 w-8 animate-spin opacity-80" />
                <p className="text-xs uppercase tracking-[0.16em] font-bold">
                  OPENING CAMERA VIEWFINDER…
                </p>
              </>
            ) : (
              <>
                <Camera className="h-9 w-9 opacity-60" />
                <p className="text-xs uppercase tracking-[0.16em] font-bold">
                  ACTIVATE CAMERA TO SCAN SIGNED QR PASSES
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 border border-amber-400/70 bg-amber-400/10 text-xs">{error}</div>
      )}

      <div className="flex justify-center">
        {status !== 'active' ? (
          <button
            type="button"
            disabled={status === 'starting'}
            onClick={() => void startCamera()}
            className="btn-slide btn-slide-solid px-5 py-2.5 text-xs"
          >
            <Camera className="h-4 w-4" />
            {status === 'starting' ? 'STARTING CAMERA…' : 'START CAMERA SCANNER'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopCamera()}
            className="btn-slide px-5 py-2.5 text-xs"
          >
            <CameraOff className="h-4 w-4" /> STOP CAMERA
          </button>
        )}
      </div>
    </div>
  );
}
