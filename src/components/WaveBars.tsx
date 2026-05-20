import { useEffect, useRef } from 'react';

interface WaveBarsProps {
  analyser: AnalyserNode | null;
  active: boolean;
}

const BAR_COUNT = 5;
// Bars taper from outside in — middle bar reads as the loudest, which
// is what people unconsciously expect from a meter visualisation.
const BAR_SCALE = [0.55, 0.8, 1.0, 0.8, 0.55];
const SILENCE_THRESHOLD = 0.015;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 36;

/**
 * WaveBars — 5 vertical bars whose heights are driven by the live RMS
 * of an AnalyserNode's time-domain buffer. Stays flat (4px each) when
 * the room is silent or `active` is false. Cleans up its RAF loop and
 * resets bar heights whenever the source analyser disappears.
 */
export default function WaveBars({ analyser, active }: WaveBarsProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>(Array(BAR_COUNT).fill(null));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const flatten = () => {
      for (const bar of barsRef.current) {
        if (bar) bar.style.height = `${MIN_HEIGHT}px`;
      }
    };

    if (!analyser || !active) {
      flatten();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const buffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);

      // RMS of the centred PCM waveform: 0 at silence, ~0.3 at normal
      // speaking volume, ~0.6+ for shouts.
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const rmsClean = rms < SILENCE_THRESHOLD ? 0 : rms;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        const target = rmsClean * 220 * BAR_SCALE[i];
        const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, target));
        bar.style.height = `${h}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      flatten();
    };
  }, [analyser, active]);

  return (
    <div
      className="flex items-end justify-center gap-1.5"
      style={{ height: `${MAX_HEIGHT}px` }}
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-1 rounded-full bg-accent transition-[height] duration-75 ease-out"
          style={{ height: `${MIN_HEIGHT}px` }}
        />
      ))}
    </div>
  );
}
