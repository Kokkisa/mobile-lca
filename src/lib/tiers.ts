/**
 * tiers.ts — Tier 1 prepared Q&A bank.
 *
 * The desktop renderer uses cosine-similarity over OpenAI embeddings
 * for Tier 1 matching (renderer.js ~142-185). That requires shipping
 * 47 MB of 1536-dim float vectors to the client, which the mobile
 * build can't afford on a cellular first-load.
 *
 * B6 ships a lighter substitute: bag-of-words overlap between the
 * transcript and each prepared question. It's strict-keyword, not
 * semantic — "how do I salt a key" won't find "What is data skew
 * salting" — but it's instant, runs offline once /tier1.json has
 * loaded once, and the bank's questions are well-phrased enough
 * that direct lexical overlap is a reasonable first pass. Semantic
 * matching can be added later as a Vercel embeddings proxy without
 * changing this module's public surface.
 */

export interface Tier1Entry {
  id: string;
  question: string;
  answer: string;
  group: string;
  source: string;
}

interface Tier1IndexEntry {
  entry: Tier1Entry;
  /** Lowercased word set of the prepared question, computed once at
   *  load time so per-match scoring is just N Set lookups. */
  questionWords: Set<string>;
}

const MIN_SCORE = 2;

let index: Tier1IndexEntry[] = [];
let loaded = false;

function tokenize(text: string): Set<string> {
  // Split on any non-word run — collapses punctuation, whitespace,
  // hyphens. Lowercased so the score is case-insensitive.
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean),
  );
}

/**
 * loadTier1 — fetch /tier1.json (served from /public), parse, and
 * pre-tokenise each question. Safe to call multiple times; subsequent
 * calls short-circuit unless the previous attempt left the index
 * empty (e.g. a failed first fetch).
 */
export async function loadTier1(): Promise<void> {
  if (loaded && index.length > 0) return;
  try {
    const res = await fetch('/tier1.json');
    if (!res.ok) {
      console.error(`[tier1] fetch failed: HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as Tier1Entry[];
    if (!Array.isArray(data)) {
      console.error('[tier1] expected array, got', typeof data);
      return;
    }
    index = data.map((entry) => ({
      entry,
      questionWords: tokenize(entry.question),
    }));
    loaded = true;
    console.log(`[tier1] loaded ${data.length} entries`);
  } catch (e) {
    console.error('[tier1] load failed:', e);
  }
}

/**
 * findTier1Match — return the prepared Q&A whose question shares the
 * most words with the transcript, provided the overlap is at least
 * MIN_SCORE (2) unique words. Returns null otherwise.
 *
 * Ties broken by first-encountered (insertion order), which matches
 * the order entries appear in the source bank.
 */
export function findTier1Match(transcript: string): Tier1Entry | null {
  if (!transcript || index.length === 0) return null;

  const words = tokenize(transcript);
  if (words.size === 0) return null;

  let bestEntry: Tier1Entry | null = null;
  let bestScore = 0;

  for (const item of index) {
    let score = 0;
    for (const word of words) {
      if (item.questionWords.has(word)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = item.entry;
    }
  }

  return bestScore >= MIN_SCORE ? bestEntry : null;
}
