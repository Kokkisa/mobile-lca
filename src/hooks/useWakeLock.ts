import { useCallback, useEffect, useRef } from 'react';

// Minimal local types so this compiles on any TS DOM lib version —
// `wakeLock` was added to Navigator in newer TS releases but isn't
// guaranteed across all 5.x lib versions.
interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockAPILike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockAPILike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockAPILike };
  return nav.wakeLock ?? null;
}

interface UseWakeLockReturn {
  supported: boolean;
  request: () => Promise<void>;
  release: () => Promise<void>;
}

/**
 * useWakeLock — hold a Screen Wake Lock so iOS Safari doesn't dim or
 * lock the screen mid-session. Fails silently on browsers without
 * `navigator.wakeLock`, on http (non-secure) origins, or when the user
 * denies. The OS automatically releases the sentinel when the page
 * becomes hidden; we don't try to re-acquire on visibility change here
 * because the session lifecycle owns request/release explicitly.
 */
export function useWakeLock(): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const supported = getWakeLock() !== null;

  const request = useCallback(async () => {
    const api = getWakeLock();
    if (!api) return;
    if (sentinelRef.current && !sentinelRef.current.released) return;

    try {
      const sentinel = await api.request('screen');
      sentinelRef.current = sentinel;
      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
      });
    } catch {
      // Permission denied, document not visible, etc. — silently no-op.
    }
  }, []);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (!sentinel || sentinel.released) return;
    try {
      await sentinel.release();
    } catch {
      // Already released by the OS — fine.
    }
  }, []);

  // Safety net: release on unmount so we don't leak the lock after a
  // hot reload or full-app teardown.
  useEffect(() => {
    return () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {});
      }
    };
  }, []);

  return { supported, request, release };
}
