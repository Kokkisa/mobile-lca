import { useEffect, useRef, useState } from 'react';

// Ported from livecallassistant/renderer.js (~lines 1501-1536) — same
// RMS threshold and silence-window heuristic that drove desktop VAD.
const RMS_THRESHOLD = 0.015;
const POLL_INTERVAL_MS = 100;
const SILENCE_DURATION_MS = 800;

interface UseVADOptions {
  analyser: AnalyserNode | null;
  onSpeechStart?: (timestamp: number) => void;
  onSpeechEnd?: (start: number, end: number) => void;
  /** Pause polling without tearing down the analyser graph — used by
   *  the manual mute button so unmute can resume instantly. */
  paused?: boolean;
}

interface UseVADReturn {
  isSpeaking: boolean;
  speechStart: number | null;
  speechEnd: number | null;
}

/**
 * useVAD — polls an AnalyserNode every 100ms and classifies each frame
 * as speech (RMS > 0.015) or silence. speech-start fires immediately
 * on the first speech frame; speech-end fires after 800ms of
 * continuous silence following a speech frame. Heuristic ported from
 * the desktop renderer so behaviour stays consistent between Electron
 * and mobile-web builds.
 *
 * Callbacks are held in refs so consumers don't have to memoise the
 * functions they pass in — re-rendering with fresh closures Just Works.
 */
export function useVAD({
  analyser,
  onSpeechStart,
  onSpeechEnd,
  paused = false,
}: UseVADOptions): UseVADReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechStart, setSpeechStart] = useState<number | null>(null);
  const [speechEnd, setSpeechEnd] = useState<number | null>(null);

  // Refs so the setInterval closure always reads fresh values without
  // re-binding the interval each render.
  const isSpeakingRef = useRef(false);
  const speechStartRef = useRef<number | null>(null);
  const lastSpeechTimeRef = useRef<number | null>(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechStart, onSpeechEnd]);

  useEffect(() => {
    if (!analyser || paused) {
      // No analyser yet OR we've been paused (mute). Either way, drop
      // all speech state so we don't fire a phantom speech-end the
      // moment polling resumes.
      isSpeakingRef.current = false;
      speechStartRef.current = null;
      lastSpeechTimeRef.current = null;
      setIsSpeaking(false);
      setSpeechStart(null);
      return;
    }

    const buffer = new Uint8Array(analyser.fftSize);

    const intervalId = window.setInterval(() => {
      analyser.getByteTimeDomainData(buffer);

      // RMS over the centred PCM waveform: 0 = silence, ~0.3 = normal
      // conversation, > 0.5 = shout.
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const now = performance.now();

      if (rms > RMS_THRESHOLD) {
        lastSpeechTimeRef.current = now;
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          speechStartRef.current = now;
          setIsSpeaking(true);
          setSpeechStart(now);
          onSpeechStartRef.current?.(now);
        }
      } else if (isSpeakingRef.current && lastSpeechTimeRef.current !== null) {
        const silenceMs = now - lastSpeechTimeRef.current;
        if (silenceMs >= SILENCE_DURATION_MS) {
          const start = speechStartRef.current ?? lastSpeechTimeRef.current;
          const end = lastSpeechTimeRef.current;
          isSpeakingRef.current = false;
          speechStartRef.current = null;
          lastSpeechTimeRef.current = null;
          setIsSpeaking(false);
          setSpeechEnd(end);
          onSpeechEndRef.current?.(start, end);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      isSpeakingRef.current = false;
      speechStartRef.current = null;
      lastSpeechTimeRef.current = null;
    };
  }, [analyser, paused]);

  return { isSpeaking, speechStart, speechEnd };
}
