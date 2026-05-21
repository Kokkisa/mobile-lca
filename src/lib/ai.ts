/**
 * ai.ts — Tier-3 streaming answer providers.
 *
 * Ports streamOpenAIAnswer + streamClaudeAnswer from the desktop
 * renderer (livecallassistant/renderer.js, ~lines 1788-1933) but
 * adapts the surface for the mobile build:
 *   - returns a `Promise<void>`; tokens flow out through onChunk
 *     callbacks instead of writing to a DOM element directly
 *   - never throws — the live-call loop has to keep running even
 *     if one answer fails (network blip, 401, 429, etc.)
 *   - no RAG / no conversation history yet (mobile store doesn't
 *     hold either yet — single-turn answers for B5)
 */

import { getResumeContext } from './rag';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const OPENAI_MODEL = 'gpt-4o';
// Matches the desktop build's default (livecallassistant/renderer.js
// line 1863) — the entitlement that's actually on the user's account.
const ANTHROPIC_MODEL = 'claude-sonnet-4-5';

const MAX_TOKENS = 300;
const TEMPERATURE = 0.4;

/**
 * Persona-grounded system prompt. The LLM speaks AS Nithin in first
 * person, with the full resume inlined as background context so every
 * answer can reference specific HPCL projects, metrics, and tools
 * accurately. Answer-shape rules are tightened vs the desktop build:
 * 3-5 sentence cap, STAR format on behaviorals, technical answers
 * lead with the conclusion before the explanation.
 */
export function buildSystemPrompt(): string {
  return `You are Nithin Kokkisa, a senior data scientist and AI/ML engineer being interviewed for a data science or engineering role in the United States.
Answer every question in first person as Nithin himself.

YOUR BACKGROUND:
${getResumeContext()}

ANSWER RULES:
- Answer in 3-5 sentences maximum, concise and confident
- For behavioral questions use STAR format (Situation, Task, Action, Result)
- For technical questions: direct answer first, then brief explanation
- Plain text only — no markdown, no bullets, no headers
- Never open with: Great question, Certainly, Of course, Absolutely, Sure
- Start immediately with the substance
- Ground answers in your actual HPCL experience and projects whenever relevant
- If asked about something not in your background, answer honestly and briefly`;
}

interface OpenAIStreamEvent {
  choices?: Array<{ delta?: { content?: string } }>;
}

interface AnthropicStreamEvent {
  delta?: {
    type?: string;
    text?: string;
  };
}

/**
 * readSSE — drains a fetch Response body line-by-line, tracking SSE
 * event blocks so callers can dispatch on event type at the *protocol*
 * layer rather than inspecting the data payload.
 *
 * SSE structure is:
 *     event: <name>           ← optional
 *     data:  <payload>
 *                             ← blank line ends the block
 *
 * We hold the trailing (possibly incomplete) line in `buf` across
 * chunk boundaries, and we hold `currentEvent` across them too — a
 * chunk can end after the `event:` line and before the `data:` line.
 *
 * `onEvent` receives `(eventType, payload)` where eventType is the
 * most recent `event:` value (or null if none preceded the data line —
 * which is the OpenAI case, since they don't send event lines).
 */
async function readSSE(
  response: Response,
  onEvent: (eventType: string | null, payload: string) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let currentEvent: string | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        // Blank line = end of an SSE event block. Reset so a stray
        // data line in the next block doesn't inherit this type.
        currentEvent = null;
        continue;
      }
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        onEvent(currentEvent, payload);
        continue;
      }
      // Ignore id:, retry:, and `: comment` lines.
    }
  }
}

export async function streamOpenAIAnswer(
  question: string,
  apiKey: string,
  onChunk: (token: string) => void,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<void> {
  if (!apiKey) {
    console.warn('[ai/openai] no api key — skipping');
    return;
  }

  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        // History is the prior turns only; the current question is
        // appended last so it's the most-recent user message.
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          ...history,
          { role: 'user', content: question },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[ai/openai] HTTP ${res.status} ${res.statusText}`, errText.slice(0, 200));
      return;
    }

    // OpenAI doesn't use event: lines, so eventType is always null.
    // [DONE] is a terminator sentinel, not a token.
    await readSSE(res, (_eventType, payload) => {
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload) as OpenAIStreamEvent;
        const token = json.choices?.[0]?.delta?.content;
        if (token) onChunk(token);
      } catch {
        // Partial JSON straddling a chunk boundary — drop it; the
        // next read will deliver the rest.
      }
    });
  } catch (e) {
    console.error('[ai/openai] request failed:', e);
  }
}

export async function streamClaudeAnswer(
  question: string,
  apiKey: string,
  onChunk: (token: string) => void,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<void> {
  if (!apiKey) {
    console.warn('[ai/claude] no api key — skipping');
    return;
  }

  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic refuses browser-origin requests by default; this
        // header is the explicit opt-in. Acceptable here because the
        // user's key lives only in their own localStorage and the
        // request is keyed to their session — same trust model the
        // desktop build already uses.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: buildSystemPrompt(),
        // Claude takes the system prompt separately; `messages` is
        // user/assistant turns only. History first, current question
        // last so it's the most-recent user message.
        messages: [...history, { role: 'user', content: question }],
      }),
    });

    if (res.status !== 200) {
      const errText = await res.clone().text();
      throw new Error(`Claude ${res.status}: ${errText}`);
    }

    // Gate on the SSE event type, not on a field inside the data JSON.
    // Claude emits message_start, content_block_start, ping,
    // content_block_delta, content_block_stop, message_delta,
    // message_stop — only content_block_delta carries text tokens.
    // The inner delta.type === 'text_delta' check is the second-line
    // defence for future delta variants (e.g. input_json_delta for
    // tool use), so we don't accidentally feed JSON into the answer.
    await readSSE(res, (eventType, payload) => {
      if (eventType !== 'content_block_delta') return;
      try {
        const json = JSON.parse(payload) as AnthropicStreamEvent;
        if (json.delta?.type === 'text_delta' && json.delta.text) {
          onChunk(json.delta.text);
        }
      } catch {
        // Partial JSON across a chunk boundary — drop it.
      }
    });
  } catch (e) {
    console.error('[ai/claude] request failed:', e);
  }
}
