import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore, type Model } from '../store/useStore';
import {
  clearCustomBank,
  getTier1Stats,
  loadTier1,
  parseAndStripBank,
  saveCustomBank,
  type Tier1Stats,
} from '../lib/tiers';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6 0-10-7-10-7a19.77 19.77 0 0 1 4.18-4.86" />
      <path d="M9.9 4.24A10.93 10.93 0 0 1 12 4c6 0 10 7 10 7a19.86 19.86 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

interface TextInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

/** Plain text input — same visual treatment as KeyInput minus the
 *  password masking and show/hide eye. Used for non-secret fields like
 *  the interview target role/company. */
function TextInput({ label, placeholder, value, onChange }: TextInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10px] tracking-[0.2em] text-text-dim">{label}</label>
        {value && (
          <span className="font-mono text-[9px] tracking-widest text-accent">SAVED</span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        className="w-full bg-panel border border-border rounded-xl px-4 py-3 text-[14px] font-mono text-text placeholder:text-text-dim/60 focus:outline-none focus:border-accent/60"
      />
    </div>
  );
}

interface KeyInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

function KeyInput({ label, placeholder, value, onChange }: KeyInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10px] tracking-[0.2em] text-text-dim">{label}</label>
        {value && (
          <span className="font-mono text-[9px] tracking-widest text-accent">SAVED</span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-panel border border-border rounded-xl px-4 py-3 pr-12 text-[14px] font-mono text-text placeholder:text-text-dim/60 focus:outline-none focus:border-accent/60"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-text-dim active:opacity-60"
          aria-label={show ? 'Hide key' : 'Show key'}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}

interface ModelOptionProps {
  value: Model;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: (v: Model) => void;
}

function ModelOption({ value, label, hint, selected, onSelect }: ModelOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        selected
          ? 'flex-1 text-left px-4 py-3 rounded-xl border border-accent bg-accent/10 active:opacity-80'
          : 'flex-1 text-left px-4 py-3 rounded-xl border border-border bg-panel active:opacity-70'
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={
            selected
              ? 'block w-3 h-3 rounded-full border-2 border-accent bg-accent'
              : 'block w-3 h-3 rounded-full border-2 border-muted'
          }
        />
        <span className="font-mono text-[12px] tracking-wider text-text">{label}</span>
      </div>
      <p className="font-mono text-[10px] text-text-dim tracking-wider ml-5">{hint}</p>
    </button>
  );
}

export default function SettingsScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const groqApiKey = useStore((s) => s.groqApiKey);
  const setGroqApiKey = useStore((s) => s.setGroqApiKey);
  const openaiApiKey = useStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useStore((s) => s.setOpenaiApiKey);
  const anthropicApiKey = useStore((s) => s.anthropicApiKey);
  const setAnthropicApiKey = useStore((s) => s.setAnthropicApiKey);
  const selectedModel = useStore((s) => s.selectedModel);
  const setSelectedModel = useStore((s) => s.setSelectedModel);
  const targetRole = useStore((s) => s.targetRole);
  const setTargetRole = useStore((s) => s.setTargetRole);
  const targetCompany = useStore((s) => s.targetCompany);
  const setTargetCompany = useStore((s) => s.setTargetCompany);

  const isReady = Boolean(openaiApiKey || anthropicApiKey);

  // ── Q&A bank state ──────────────────────────────────────────────
  // Initial stats may show count=0 if Settings is opened before
  // App.tsx's mount-effect finishes loadTier1(); the useEffect below
  // re-checks once the load promise resolves.
  const [bankInfo, setBankInfo] = useState<Tier1Stats>(() => getTier1Stats());
  const [bankStatus, setBankStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTier1().then(() => {
      if (!cancelled) setBankInfo(getTier1Stats());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onUploadTap = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankStatus('Reading file…');
    try {
      const text = await file.text();
      const entries = parseAndStripBank(text);
      if (!entries) {
        setBankStatus('Invalid file format');
        return;
      }
      await saveCustomBank(entries);
      setBankInfo(getTier1Stats());
      setBankStatus(`Loaded ${entries.length.toLocaleString()} entries`);
    } catch (err) {
      setBankStatus(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      // Reset the input so re-selecting the same file fires onChange.
      if (e.target) e.target.value = '';
    }
  };

  const onResetBank = async () => {
    setBankStatus('Resetting…');
    try {
      await clearCustomBank();
      setBankInfo(getTier1Stats());
      setBankStatus('Reset to default');
    } catch (err) {
      setBankStatus(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="flex flex-col h-full w-full safe-x bg-bg">
      {/* Header */}
      <header className="safe-top">
        <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-border">
          <button
            onClick={() => setScreen('voice')}
            className="text-text-dim hover:text-text p-1.5 -m-1.5 active:opacity-60"
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <h1 className="font-mono text-sm tracking-[0.25em] text-text">SETTINGS</h1>
          <div
            className={
              isReady
                ? 'flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-accent/40 bg-accent/10'
                : 'flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-yellow-500/40 bg-yellow-500/10'
            }
          >
            <span
              className={
                isReady ? 'block w-1.5 h-1.5 rounded-full bg-accent' : 'block w-1.5 h-1.5 rounded-full bg-yellow-400'
              }
            />
            <span
              className={
                isReady
                  ? 'font-mono text-[9px] tracking-widest text-accent'
                  : 'font-mono text-[9px] tracking-widest text-yellow-400'
              }
            >
              {isReady ? 'READY' : 'NEEDS KEYS'}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-6">
        {/* Interview target — surfaces into the system prompt so
            answers are tailored to the specific role + company the
            user is interviewing for. */}
        <section className="space-y-4">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-text-dim">
            INTERVIEW TARGET
          </h2>
          <TextInput
            label="ROLE"
            placeholder="e.g. Senior Data Scientist"
            value={targetRole}
            onChange={setTargetRole}
          />
          <TextInput
            label="COMPANY"
            placeholder="e.g. Uber, Microsoft, Google"
            value={targetCompany}
            onChange={setTargetCompany}
          />
        </section>

        {/* API keys */}
        <section className="space-y-4">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-text-dim">API KEYS</h2>
          <KeyInput
            label="GROQ — TRANSCRIPTION"
            placeholder="gsk_..."
            value={groqApiKey}
            onChange={setGroqApiKey}
          />
          <KeyInput
            label="OPENAI — LLM + EMBEDDINGS"
            placeholder="sk-..."
            value={openaiApiKey}
            onChange={setOpenaiApiKey}
          />
          <KeyInput
            label="ANTHROPIC — LLM"
            placeholder="sk-ant-..."
            value={anthropicApiKey}
            onChange={setAnthropicApiKey}
          />
        </section>

        {/* Q&A Bank — upload custom bank from device, reset to default */}
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-text-dim">Q&amp;A BANK</h2>

          <div className="rounded-xl border border-border bg-panel p-4 space-y-4">
            <div>
              <div className="font-mono text-[14px] text-text">
                {bankInfo.count.toLocaleString()} entries loaded
              </div>
              <div className="font-mono text-[10px] text-text-dim tracking-widest mt-1">
                {bankInfo.source === 'custom'
                  ? 'CUSTOM BANK'
                  : bankInfo.source === 'default'
                    ? 'DEFAULT BANK'
                    : 'NOT YET LOADED'}
              </div>
            </div>

            {bankStatus && (
              <div className="font-mono text-[11px] text-accent">{bankStatus}</div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={onUploadTap}
                className="w-full font-mono text-[11px] tracking-[0.18em] text-bg font-bold bg-accent rounded-lg min-h-[44px] flex items-center justify-center active:opacity-70"
              >
                UPLOAD Q&amp;A BANK
              </button>
              <button
                type="button"
                onClick={onResetBank}
                className="w-full font-mono text-[11px] tracking-[0.18em] text-text-dim border border-border rounded-lg min-h-[44px] flex items-center justify-center active:opacity-60"
              >
                RESET TO DEFAULT
              </button>
            </div>

            {/* Hidden — actual file picker triggered by the button
                above so the native input doesn't steal styling. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onFileSelected}
            />
          </div>
        </section>

        {/* Model picker */}
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-text-dim">ANSWER MODEL</h2>
          <div className="flex gap-3">
            <ModelOption
              value="gpt-4o"
              label="GPT-4o"
              hint="OpenAI"
              selected={selectedModel === 'gpt-4o'}
              onSelect={setSelectedModel}
            />
            <ModelOption
              value="claude-3-5-sonnet"
              label="Claude 3.5"
              hint="Anthropic"
              selected={selectedModel === 'claude-3-5-sonnet'}
              onSelect={setSelectedModel}
            />
          </div>
        </section>

        {/* Build info */}
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-text-dim">BUILD</h2>
          <div className="rounded-xl border border-border bg-panel p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-widest text-text-dim">BLOCK</span>
              <span className="font-mono text-[11px] tracking-wider text-accent">B1</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-widest text-text-dim">STATUS</span>
              <span className="flex items-center gap-1.5">
                <span className="block w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="font-mono text-[11px] tracking-wider text-text">COMPLETE</span>
              </span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-text-dim pt-2 border-t border-border">
              Scaffold · navigation · settings UI. Audio capture and the
              three-tier answer engine arrive in B2+.
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="safe-bottom">
        <div className="px-4 pt-3 pb-4 border-t border-border">
          <button
            onClick={() => setScreen('voice')}
            className="w-full font-mono text-[12px] tracking-[0.18em] py-3 rounded-xl bg-accent text-bg font-bold glow-accent active:opacity-80"
          >
            BACK TO SESSION
          </button>
        </div>
      </footer>
    </div>
  );
}
