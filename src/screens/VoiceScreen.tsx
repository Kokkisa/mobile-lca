import { useStore, type Status } from '../store/useStore';

const STATUS_META: Record<Status, { label: string; dot: string; pulse: boolean }> = {
  idle:       { label: 'STANDBY',    dot: 'bg-text-dim',         pulse: false },
  listening:  { label: 'LISTENING',  dot: 'bg-accent glow-accent', pulse: true  },
  processing: { label: 'PROCESSING', dot: 'bg-yellow-400',       pulse: true  },
  answering:  { label: 'ANSWERING',  dot: 'bg-accent',           pulse: false },
};

function StatusPill({ status }: { status: Status }) {
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
  const setScreen = useStore((s) => s.setScreen);

  const isActive = status !== 'idle';

  const onToggleSession = () => {
    if (isActive) setStatus('idle');
    else setStatus('listening');
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
          <StatusPill status={status} />
          <button
            onClick={() => setScreen('settings')}
            className="text-text-dim hover:text-text p-1.5 -m-1.5 active:opacity-60"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Transcript bubble */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl bg-panel border border-border px-4 py-3 min-h-[64px] flex items-center">
          <span className="font-mono text-[10px] text-text-dim tracking-widest mr-3 shrink-0">HEARD</span>
          {transcript ? (
            <p className="text-sm text-text leading-relaxed line-clamp-3">{transcript}</p>
          ) : (
            <p className="text-sm text-text-dim italic">Waiting for the next question…</p>
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
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-text">{answer}</p>
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
            TIER <span className="text-text-dim">—</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
