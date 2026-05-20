/**
 * tier2.ts — Tier-2 semantic cache.
 *
 * Every Tier-3 answer is embedded and stashed in memory. When the next
 * transcript arrives, we embed it and cosine-match against the cache.
 * If a stored question is similar enough (>= 0.85), we serve its
 * answer instantly instead of paying for another LLM round-trip.
 *
 * In-memory only — wipes on page reload. FIFO eviction past 50
 * entries keeps the lookup loop bounded and avoids unbounded memory
 * growth across long sessions.
 */

interface CachedAnswer {
  question: string;
  answer: string;
  embedding: number[];
}

const MAX_CACHE_SIZE = 50;
const SIMILARITY_THRESHOLD = 0.85;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';

let cache: CachedAnswer[] = [];

/**
 * Standard cosine similarity. Returns 0 if either vector is degenerate
 * (zero magnitude or mismatched length). A tiny epsilon in the
 * denominator avoids NaN if both vectors happen to be all zeros.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * embedText — POST to OpenAI's embeddings endpoint. Returns the vector
 * on success, null on any failure (missing key, HTTP error, bad shape,
 * network blip). Callers treat null as "cache miss" rather than crashing.
 */
async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  if (!apiKey || !text) return null;
  try {
    const res = await fetch(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });
    if (!res.ok) {
      console.error(`[tier2] embed HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = data.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch (e) {
    console.error('[tier2] embed request failed:', e);
    return null;
  }
}

/**
 * addToCache — embed the question, store the (question, answer,
 * embedding) triple. FIFO-evicts the oldest entries past MAX_CACHE_SIZE.
 * Silent on any failure — the cache is best-effort.
 */
export async function addToCache(
  question: string,
  answer: string,
  openaiApiKey: string,
): Promise<void> {
  if (!openaiApiKey || !question || !answer) return;
  const embedding = await embedText(question, openaiApiKey);
  if (!embedding) return;
  cache.push({ question, answer, embedding });
  if (cache.length > MAX_CACHE_SIZE) {
    cache.splice(0, cache.length - MAX_CACHE_SIZE);
  }
}

/**
 * findCachedAnswer — embed the transcript, cosine-match against every
 * cached embedding, return the highest-scoring answer if its similarity
 * crosses SIMILARITY_THRESHOLD (0.85). Returns null otherwise.
 */
export async function findCachedAnswer(
  transcript: string,
  openaiApiKey: string,
): Promise<string | null> {
  if (!openaiApiKey || !transcript || cache.length === 0) return null;
  const embedding = await embedText(transcript, openaiApiKey);
  if (!embedding) return null;

  let bestAnswer: string | null = null;
  let bestSim = 0;
  for (const entry of cache) {
    const sim = cosineSimilarity(embedding, entry.embedding);
    if (sim > bestSim) {
      bestSim = sim;
      bestAnswer = entry.answer;
    }
  }
  return bestSim >= SIMILARITY_THRESHOLD ? bestAnswer : null;
}
