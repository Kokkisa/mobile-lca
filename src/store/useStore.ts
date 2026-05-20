import { create } from 'zustand';

export type Screen = 'voice' | 'settings';
export type Status = 'idle' | 'listening' | 'processing' | 'answering';
export type Model = 'gpt-4o' | 'claude-3-5-sonnet';

const LS = {
  groq: 'lca_groq_key',
  openai: 'lca_openai_key',
  anthropic: 'lca_anthropic_key',
  model: 'lca_selected_model',
} as const;

interface StoreState {
  screen: Screen;
  setScreen: (s: Screen) => void;

  status: Status;
  setStatus: (s: Status) => void;

  transcript: string;
  setTranscript: (t: string) => void;

  answer: string;
  setAnswer: (a: string) => void;
  appendAnswer: (chunk: string) => void;

  groqApiKey: string;
  setGroqApiKey: (k: string) => void;

  openaiApiKey: string;
  setOpenaiApiKey: (k: string) => void;

  anthropicApiKey: string;
  setAnthropicApiKey: (k: string) => void;

  selectedModel: Model;
  setSelectedModel: (m: Model) => void;

  hydrate: () => void;
}

export const useStore = create<StoreState>((set) => ({
  screen: 'voice',
  setScreen: (screen) => set({ screen }),

  status: 'idle',
  setStatus: (status) => set({ status }),

  transcript: '',
  setTranscript: (transcript) => set({ transcript }),

  answer: '',
  setAnswer: (answer) => set({ answer }),
  appendAnswer: (chunk) => set((state) => ({ answer: state.answer + chunk })),

  groqApiKey: '',
  setGroqApiKey: (k) => {
    try {
      localStorage.setItem(LS.groq, k);
    } catch {
      /* localStorage unavailable */
    }
    set({ groqApiKey: k });
  },

  openaiApiKey: '',
  setOpenaiApiKey: (k) => {
    try {
      localStorage.setItem(LS.openai, k);
    } catch {
      /* localStorage unavailable */
    }
    set({ openaiApiKey: k });
  },

  anthropicApiKey: '',
  setAnthropicApiKey: (k) => {
    try {
      localStorage.setItem(LS.anthropic, k);
    } catch {
      /* localStorage unavailable */
    }
    set({ anthropicApiKey: k });
  },

  selectedModel: 'gpt-4o',
  setSelectedModel: (m) => {
    try {
      localStorage.setItem(LS.model, m);
    } catch {
      /* localStorage unavailable */
    }
    set({ selectedModel: m });
  },

  hydrate: () => {
    try {
      const groq = localStorage.getItem(LS.groq) ?? '';
      const openai = localStorage.getItem(LS.openai) ?? '';
      const anthropic = localStorage.getItem(LS.anthropic) ?? '';
      const stored = localStorage.getItem(LS.model);
      const model: Model =
        stored === 'gpt-4o' || stored === 'claude-3-5-sonnet' ? stored : 'gpt-4o';
      set({
        groqApiKey: groq,
        openaiApiKey: openai,
        anthropicApiKey: anthropic,
        selectedModel: model,
      });
    } catch {
      /* localStorage unavailable — keep defaults */
    }
  },
}));
