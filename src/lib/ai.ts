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

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const OPENAI_MODEL = 'gpt-4o';
// Store's value is 'claude-3-5-sonnet' (UI label) — the real API
// model name needs a date or 'latest' alias. We pin to -latest so
// Anthropic can roll us forward without a code change.
const ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';

const MAX_TOKENS = 300;
const TEMPERATURE = 0.4;

/**
 * The interview-coach system prompt — copied verbatim from the desktop
 * renderer so the model's voice and style stay identical across the
 * two surfaces. RAG context is intentionally omitted here; B5 is
 * single-turn answers only.
 */
export function buildSystemPrompt(): string {
  return (
    `You are answering live as a job candidate during a technical interview call.\n\n` +
    `Answer like a senior engineer speaking naturally in an interview — confident, concise, first-person. ` +
    `Finish every answer with a complete sentence. Maximum 3 short paragraphs. No bullet points unless explicitly asked.\n\n` +
    `Never open with filler phrases like "Certainly", "Great question", "Sure", or "Of course" — start directly with the substance of the answer.\n\n` +
    `Never define a term the interviewer already used in their question. If they ask how you handle data skewness, skip what skewness is — go straight to how you handle it. Start your answer with the approach, not the definition.\n\n` +
    `Sound like spoken English, not a written report. Use natural conversational openers like "I usually tackle this a few ways", "My go-to approach is...", "In practice I...". Avoid stiff academic phrases like "involves a few strategies", "there are several approaches", "one can utilize", "it is important to note".\n\n` +
    `Output plain text only. No markdown formatting whatsoever — no backticks around code or function names, no asterisks for bold or italics, no headings, no code blocks. The answer is going to be read as spoken conversation, so even API names and method names should appear as plain words (write "groupBy" not "\`groupBy\`").`
  );
}

interface OpenAIStreamEvent {
  choices?: Array<{ delta?: { content?: string } }>;
}

interface AnthropicStreamEvent {
  type?: string;
  delta?: { text?: string; type?: string };
}

/**
 * readSSE — drains a fetch Response body line-by-line, dispatches
 * parsed JSON payloads for each `data:` line. Holds the trailing
 * (potentially partial) line in a buffer across chunk boundaries.
 * `isDone` lets the caller short-circuit on a sentinel ([DONE]) the
 * SSE format reserves for OpenAI's stream termination.
 */
async function readSSE<T>(
  response: Response,
  onEvent: (event: T) => void,
  isDone?: (raw: string) => boolean,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (isDone?.(payload)) continue;
      try {
        const json = JSON.parse(payload) as T;
        onEvent(json);
      } catch {
        // Partial frame straddling a chunk boundary — safe to drop,
        // the next read will include the full line.
      }
    }
  }
}

export async function streamOpenAIAnswer(
  question: string,
  apiKey: string,
  onChunk: (token: string) => void,
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
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: question },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[ai/openai] HTTP ${res.status} ${res.statusText}`, errText.slice(0, 200));
      return;
    }

    await readSSE<OpenAIStreamEvent>(
      res,
      (event) => {
        const token = event.choices?.[0]?.delta?.content;
        if (token) onChunk(token);
      },
      (raw) => raw === '[DONE]',
    );
  } catch (e) {
    console.error('[ai/openai] request failed:', e);
  }
}

export async function streamClaudeAnswer(
  question: string,
  apiKey: string,
  onChunk: (token: string) => void,
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
        // user/assistant turns only.
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[ai/claude] HTTP ${res.status} ${res.statusText}`, errText.slice(0, 200));
      return;
    }

    await readSSE<AnthropicStreamEvent>(res, (event) => {
      // Claude emits typed events; only content_block_delta carries
      // tokens. message_start/stop, content_block_start/stop, ping,
      // and message_delta are all ignored.
      if (event.type === 'content_block_delta') {
        const token = event.delta?.text;
        if (token) onChunk(token);
      }
    });
  } catch (e) {
    console.error('[ai/claude] request failed:', e);
  }
}
