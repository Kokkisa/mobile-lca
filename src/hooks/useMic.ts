import { useCallback, useEffect, useRef, useState } from 'react';

export type MicPermission = 'idle' | 'granted' | 'denied';

interface UseMicReturn {
  permission: MicPermission;
  stream: MediaStream | null;
  error: string | null;
  requestMicPermission: () => Promise<MediaStream | null>;
  stop: () => void;
}

/**
 * useMic — request the device microphone via getUserMedia and own its
 * lifetime. The hook never resolves to a stream silently: callers must
 * invoke requestMicPermission() in response to a user gesture (iOS
 * Safari will reject a getUserMedia call made outside a click handler).
 *
 * Permission state survives stop()/start() cycles because the browser
 * remembers the grant — re-requesting after a stop returns a fresh
 * stream without re-prompting the user.
 */
export function useMic(): UseMicReturn {
  const [permission, setPermission] = useState<MicPermission>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const requestMicPermission = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPermission('denied');
      setError('getUserMedia not supported in this browser');
      return null;
    }

    // If a previous stream is still alive, recycle it instead of
    // double-opening the device (Safari can refuse a second concurrent
    // grant on the same tab).
    if (streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === 'live')) {
      return streamRef.current;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = s;
      setStream(s);
      setPermission('granted');
      return s;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPermission('denied');
      return null;
    }
  }, []);

  // Safety net: stop any live tracks if the consumer unmounts.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { permission, stream, error, requestMicPermission, stop };
}
