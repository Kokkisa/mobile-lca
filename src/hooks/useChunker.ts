import { useCallback, useEffect, useRef } from 'react';

const MIN_DURATION_MS = 1000;

interface UseChunkerOptions {
  stream: MediaStream | null;
  onChunk: (blob: Blob, durationMs: number) => void;
}

interface UseChunkerReturn {
  start: () => void;
  stop: () => void;
}

/**
 * pickMimeType — find a MediaRecorder container the browser actually
 * supports. Chrome/Firefox happily produce webm/opus; iOS Safari only
 * accepts audio/mp4. Returning '' falls back to MediaRecorder's
 * browser default container.
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/**
 * useChunker — wraps MediaRecorder so each call to start() begins a
 * fresh segment and stop() yields a single Blob via the onChunk
 * callback. Segments shorter than MIN_DURATION_MS (1s) are discarded
 * so coughs and lip-smacks don't make it into the transcription queue.
 *
 * Each segment owns its own chunks array via closure, so a fast
 * start → stop → start sequence can't cross-contaminate blobs even if
 * the previous recorder's dataavailable fires after the new one has
 * begun.
 */
export function useChunker({ stream, onChunk }: UseChunkerOptions): UseChunkerReturn {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(stream);
  const onChunkRef = useRef(onChunk);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const start = useCallback(() => {
    const s = streamRef.current;
    if (!s || recorderRef.current) return;

    let rec: MediaRecorder;
    try {
      const mimeType = pickMimeType();
      rec = mimeType ? new MediaRecorder(s, { mimeType }) : new MediaRecorder(s);
    } catch (e) {
      console.error('[useChunker] failed to create MediaRecorder:', e);
      return;
    }

    // Segment-local state — each recording owns its own chunks/start so
    // back-to-back segments can't bleed into each other.
    const chunks: Blob[] = [];
    const startedAt = performance.now();

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    rec.onstop = () => {
      const duration = performance.now() - startedAt;
      if (duration < MIN_DURATION_MS || chunks.length === 0) return;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      onChunkRef.current(blob, duration);
    };

    rec.onerror = (e) => {
      console.error('[useChunker] recorder error:', e);
    };

    try {
      rec.start();
      recorderRef.current = rec;
    } catch (e) {
      console.error('[useChunker] start() threw:', e);
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || rec.state === 'inactive') return;
    try {
      rec.stop();
    } catch (e) {
      console.error('[useChunker] stop() threw:', e);
    }
  }, []);

  // Safety net: stop any in-flight recorder on unmount so we don't
  // leak the encoder past a hot reload or full-app teardown.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* already stopping */
        }
      }
    };
  }, []);

  return { start, stop };
}
