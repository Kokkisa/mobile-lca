import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type Status } from '../store/useStore';
import { useMic } from '../hooks/useMic';
import { useWakeLock } from '../hooks/useWakeLock';
import { useVAD } from '../hooks/useVAD';
import { useChunker } from '../hooks/useChunker';
import { transcribeChunk } from '../lib/whisper';
import { streamOpenAIAnswer, streamClaudeAnswer } from '../lib/ai';
import { findTier1Match } from '../lib/tiers';
import { findCachedAnswer, addToCache } from '../lib/tier2';
import WaveBars from '../components/WaveBars';

const STATUS_META: Record<Status, { label: string; dot: string; pulse: boolean }> = {
  idle:       { label: 'STANDBY',    dot: 'bg-text-dim',         pulse: false },
  listening:  { label: 'LISTENING',  dot: 'bg-accent glow-accent', pulse: true  },
  processing: { label: 'PROCESSING', dot: 'bg-yellow-400',       pulse: true  },
  answering:  { label: 'ANSWERING',  dot: 'bg-accent',           pulse: false },
};

function StatusPill({ status, muted }: { status: Status; muted: boolean }) {
  // Mute overrides the listening/processing/answering label — the user
  // needs an unambiguous "your mic is off" signal regardless of what
  // the pipeline is doing in the background.
  if (muted) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/40">
        <span className="block w-2 h-2 rounded-full bg-red-500 animate-pulse-ring" />
        <span className="font-mono text-[11px] tracking-[0.18em] text-red-400">MUTED</span>
      </div>
    );
  }
  const meta = STATUS_META[status];
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-panel border border-border">
      <span
        className={`block w-2 h-2 rounded-full ${meta.dot} ${meta.pulse ? 'animate-pulse-ring' : ''}`}
      />
      <span className="font-mono text-[11px] tracking-[0.18em] text-text-dim">
        {meta.label}
      </span>
    </div>
  );
}

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

const MUTE_DURATION_SECONDS = 45;

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01A1.65 1.65 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ConcentricRings() {
  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-border animate-ring-rotate" />
      <div className="absolute inset-4 rounded-full border border-border/70" />
      <div className="absolute inset-10 rounded-full border border-accent/30" />
      <div className="absolute inset-16 rounded-full bg-accent/10 border border-accent/50" />
      <span className="relative font-mono text-[10px] tracking-[0.3em] text-text-dim">
        IDLE
      </span>
    </div>
  );
}

export default function VoiceScreen() {
  const status = useStore((s) => s.status);
  const setStatus = useStore((s) => s.setStatus);
  const transcript = useStore((s) => s.transcript);
  const answer = useStore((s) => s.answer);
  const setTranscript = useStore((s) => s.setTranscript);
  const setAnswer = useStore((s) => s.setAnswer);
  const appendAnswer = useStore((s) => s.appendAnswer);
  const appendToHistory = useStore((s) => s.appendToHistory);
  const clearHistory = useStore((s) => s.clearHistory);
  const setScreen = useStore((s) => s.setScreen);

  const mic = useMic();
  const wakeLock = useWakeLock();

  // Audio graph: MediaStreamSource → AnalyserNode. Held in refs so we
  // can tear them down on STOP, exposed as state so WaveBars can react.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Debug surface for B3 — how many speech segments the VAD+chunker
  // pipeline has produced this session.
  const [chunkCount, setChunkCount] = useState(0);

  // Which tier answered the most recent chunk — drives the badge in
  // the bottom-right of the session bar. null = no answer yet.
  const [currentTier, setCurrentTier] = useState<1 | 2 | 3 | null>(null);

  // Manual mute — pauses VAD + chunker but keeps the mic stream alive
  // so unmute is instant (no re-prompt). Auto-clears after 45s; tapping
  // again while muted just resets the countdown.
  const [muted, setMuted] = useState(false);
  const [muteRemaining, setMuteRemaining] = useState(0);
  const muteTimerRef = useRef<number | null>(null);

  const clearMuteTimer = useCallback(() => {
    if (muteTimerRef.current !== null) {
      window.clearInterval(muteTimerRef.current);
      muteTimerRef.current = null;
    }
  }, []);

  const startMuteCountdown = useCallback(() => {
    clearMuteTimer();
    setMuteRemaining(MUTE_DURATION_SECONDS);
    muteTimerRef.current = window.setInterval(() => {
      setMuteRemaining((r) => {
        if (r <= 1) {
          // Auto-unmute. Clear inside the setter so we don't race with
          // a stale ref reading.
          clearMuteTimer();
          setMuted(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, [clearMuteTimer]);

  const onMuteTap = () => {
    if (muted) {
      // Tap-while-muted resets the countdown — the dedicated UNMUTE
      // button (rendered next to it while muted) is the manual escape.
      startMuteCountdown();
      return;
    }
    setMuted(true);
    startMuteCountdown();
  };

  const onUnmute = () => {
    // Immediate manual unmute — clear timer + state in one shot so VAD
    // and the chunker resume on the next render.
    clearMuteTimer();
    setMuted(false);
    setMuteRemaining(0);
  };

  // Safety net: clear timer on unmount so hot reload / app close doesn't
  // leave the interval running.
  useEffect(() => {
    return () => {
      clearMuteTimer();
    };
  }, [clearMuteTimer]);

  const handleChunk = useCallback(
    async (blob: Blob, durationMs: number) => {
      // eslint-disable-next-line no-console
      console.log(
        `[chunk] ${Math.round(durationMs)}ms · ${(blob.size / 1024).toFixed(1)} KB · ${blob.type}`,
      );
      setChunkCount((c) => c + 1);

      // Skip late blobs that arrive a beat after STOP.
      if (useStore.getState().status === 'idle') return;

      // Settings gate for transcription — show why nothing's happening
      // in the transcript bubble itself, skip the network call.
      const groq = useStore.getState().groqApiKey;
      if (!groq) {
        setTranscript('Add Groq API key in Settings');
        return;
      }

      setStatus('processing');
      const text = await transcribeChunk(blob, groq);

      // User may have hit STOP during the Whisper round-trip.
      if (useStore.getState().status === 'idle') return;

      if (!text) {
        // Empty transcription (silence / API error) — return to
        // listening, leave any previous transcript on screen.
        setStatus('listening');
        return;
      }
      setTranscript(text);

      // ---- Tier 1: instant match against the prepared Q&A bank ----
      const t1 = findTier1Match(text);
      if (t1) {
        setAnswer(t1.answer);
        setCurrentTier(1);
        appendToHistory('user', text);
        appendToHistory('assistant', t1.answer);
        setStatus('listening');
        return;
      }

      // ---- Tier 2: semantic cache of past Tier 3 answers ----
      // Requires an OpenAI key for the embedding call. Falls through
      // silently if missing or if findCachedAnswer errors.
      const t2Key = useStore.getState().openaiApiKey;
      if (t2Key) {
        const cached = await findCachedAnswer(text, t2Key);
        // User may have stopped during the embedding round-trip.
        if (useStore.getState().status === 'idle') return;
        if (cached) {
          setAnswer(cached);
          setCurrentTier(2);
          appendToHistory('user', text);
          appendToHistory('assistant', cached);
          setStatus('listening');
          return;
        }
      }

      // ---- Tier 3: stream an answer ----
      // Snapshot prior history BEFORE the current user turn is
      // appended, so the streamer doesn't see the new question twice
      // (once in history, once as the trailing user message).
      const {
        selectedModel,
        openaiApiKey,
        anthropicApiKey,
        conversationHistory,
      } = useStore.getState();
      const isOpenAI = selectedModel === 'gpt-4o';
      const answerKey = isOpenAI ? openaiApiKey : anthropicApiKey;

      if (!answerKey) {
        setAnswer(`Add ${isOpenAI ? 'OpenAI' : 'Anthropic'} key in Settings`);
        setStatus('listening');
        return;
      }

      setAnswer('');
      setCurrentTier(3);
      setStatus('answering');

      // Record the question now (per spec — before streaming). The
      // streamer still receives the pre-question snapshot above.
      appendToHistory('user', text);

      // Accumulate the streamed tokens locally so we have the full
      // assistant text to append to history after the stream ends.
      let streamed = '';
      const streamer = isOpenAI ? streamOpenAIAnswer : streamClaudeAnswer;
      await streamer(
        text,
        answerKey,
        (token) => {
          streamed += token;
          appendAnswer(token);
        },
        conversationHistory,
      );
      if (streamed) {
        appendToHistory('assistant', streamed);
        // Fire-and-forget: stash this Q→A pair in the Tier-2 cache so
        // a similar future question short-circuits the LLM call.
        // addToCache no-ops silently if the key is missing.
        void addToCache(text, streamed, useStore.getState().openaiApiKey);
      }

      // Final idle re-check — STOP can also land during the answer
      // stream. Leave status alone if we're already torn down.
      if (useStore.getState().status === 'idle') return;
      setStatus('listening');
    },
    [setStatus, setTranscript, setAnswer, appendAnswer, appendToHistory],
  );

  const chunker = useChunker({
    stream: mic.stream,
    onChunk: handleChunk,
    paused: muted,
  });

  // VAD drives the chunker: speech-start → MediaRecorder.start(),
  // 800ms of silence → MediaRecorder.stop() → blob via handleChunk.
  // Both hooks receive `paused` so mute cleanly halts the pipeline
  // without tearing down the audio graph.
  useVAD({
    analyser,
    onSpeechStart: chunker.start,
    onSpeechEnd: chunker.stop,
    paused: muted,
  });

  const isActive = status !== 'idle';

  const setupAudio = (stream: MediaStream) => {
    // Standard AudioContext on modern iOS Safari (14.5+); webkit
    // fallback covers older builds without crashing the type checker.
    const AudioCtxCtor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxCtor();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const node = ctx.createAnalyser();
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.6;
    source.connect(node);

    setAnalyser(node);

    // Safari sometimes returns the context in 'suspended' even when
    // created from a user gesture — resume is a no-op if already running.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };

  const teardownAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAnalyser(null);
  };

  const onToggleSession = async () => {
    if (isActive) {
      // STOP — order matters: kill analyser graph before stopping
      // tracks so the WaveBars RAF sees null first and bails cleanly.
      teardownAudio();
      mic.stop();
      await wakeLock.release();
      clearHistory();
      // Mute state is session-scoped — wipe it (and any running
      // countdown) so the next START begins unmuted.
      setMuted(false);
      setMuteRemaining(0);
      clearMuteTimer();
      setStatus('idle');
      return;
    }

    // START — must await permission BEFORE flipping status, so a
    // denied request never leaves us stuck in 'listening' with no mic.
    const stream = await mic.requestMicPermission();
    if (!stream) {
      setTranscript('Microphone access denied');
      return;
    }
    setChunkCount(0);
    setCurrentTier(null);
    setupAudio(stream);
    await wakeLock.request();
    setStatus('listening');
  };

  const onClear = () => {
    setTranscript('');
    setAnswer('');
  };

  return (
    <div className="flex flex-col h-full w-full safe-x">
      {/* Header */}
      <header className="safe-top">
        <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-accent text-lg tracking-wider glow-text">LCA</span>
            <span className="font-mono text-[10px] text-text-dim tracking-widest">v0.1</span>
          </div>
          <StatusPill status={status} muted={muted} />
          <button
            onClick={() => setScreen('settings')}
            className="text-text-dim hover:text-text p-1.5 -m-1.5 active:opacity-60"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Wave bars — only while a session is active */}
      {isActive && (
        <div className="px-4 pt-4">
          <WaveBars analyser={analyser} active={isActive} />
        </div>
      )}

      {/* Transcript bubble */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl bg-panel border border-border px-4 py-3 min-h-[64px] flex items-center">
          <span className="font-mono text-[10px] text-text-dim tracking-widest mr-3 shrink-0">HEARD</span>
          {transcript ? (
            <p className="font-mono text-sm text-text leading-relaxed line-clamp-3">{transcript}</p>
          ) : (
            <p className="font-mono text-sm text-text-dim italic">Waiting for the next question…</p>
          )}
        </div>
      </div>

      {/* Answer card */}
      <main className="flex-1 min-h-0 px-4 pt-4 pb-2">
        <div className="h-full rounded-2xl bg-panel border border-border p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] text-text-dim tracking-widest">ANSWER</span>
            {status === 'answering' && (
              <span className="font-mono text-[10px] text-accent tracking-widest animate-pulse-dim">
                STREAMING…
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {answer ? (
              <p className="font-mono text-[15px] leading-relaxed whitespace-pre-wrap text-text">{answer}</p>
            ) : (
              <div className="h-full flex items-center justify-center">
                <ConcentricRings />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom bar */}
      <footer className="safe-bottom">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-4 border-t border-border">
          <button
            onClick={onClear}
            className="font-mono text-[11px] tracking-widest text-text-dim hover:text-text px-3 py-2 rounded-lg border border-border bg-panel active:opacity-60"
          >
            CLEAR
          </button>

          {isActive && !muted && (
            <button
              onClick={onMuteTap}
              aria-label="Mute"
              className="flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-text-dim hover:text-text px-3 py-2 rounded-lg border border-border bg-panel active:opacity-60"
            >
              <MicOffIcon />
              <span>MUTE</span>
            </button>
          )}

          {isActive && muted && (
            <>
              <button
                onClick={onMuteTap}
                aria-label={`Muted, ${muteRemaining}s remaining — tap to reset`}
                className="flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-white px-3 py-2 rounded-lg bg-red-500/80 border border-red-500 active:opacity-70"
              >
                <MicOffIcon />
                <span>{muteRemaining}</span>
              </button>
              <button
                onClick={onUnmute}
                aria-label="Unmute"
                className="flex items-center gap-1.5 font-mono text-[11px] tracking-widest font-bold text-bg px-3 py-2 rounded-lg bg-accent border border-accent active:opacity-70"
              >
                <MicOnIcon />
                <span>UNMUTE</span>
              </button>
            </>
          )}

          <button
            onClick={onToggleSession}
            className={
              isActive
                ? 'flex-1 font-mono text-[12px] tracking-[0.18em] py-3 rounded-xl border border-accent text-accent bg-transparent active:opacity-70'
                : 'flex-1 font-mono text-[12px] tracking-[0.18em] py-3 rounded-xl bg-accent text-bg font-bold glow-accent active:opacity-80'
            }
          >
            {isActive ? 'STOP SESSION' : 'START SESSION'}
          </button>

          <div className="font-mono text-[11px] tracking-widest text-text-dim px-3 py-2 rounded-lg border border-border bg-panel">
            {currentTier ? (
              <span className="text-accent">T{currentTier}</span>
            ) : (
              <span>—</span>
            )}
            <span className="text-text-dim ml-2">{chunkCount}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
