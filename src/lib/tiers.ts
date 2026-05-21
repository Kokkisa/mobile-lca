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
 * that direct lexical overlap is a reasonable first pass.
 *
 * B14 — the bank source is no longer hard-coded to /tier1.json. If
 * the user uploads a custom bank (Settings → Q&A Bank), it lands in
 * localStorage under LS_KEY and takes precedence over the default
 * file. RESET TO DEFAULT clears the localStorage entry and the next
 * loadTier1() falls back to the bundled file. Embeddings on uploaded
 * entries are stripped on the way in — only question/answer/metadata
 * round-trip through storage.
 */

export interface Tier1Entry {
  // id/group/source are optional so a minimal user-uploaded entry
  // ({ question, answer }) is still a valid Tier1Entry. The matching
  // logic only reads `question`; everything else is for display.
  id?: string;
  question: string;
  answer: string;
  group?: string;
  source?: string;
}

interface Tier1IndexEntry {
  entry: Tier1Entry;
  /** Lowercased word set of the prepared question, computed once at
   *  load time so per-match scoring is just N Set lookups. */
  questionWords: Set<string>;
}

export interface Tier1Stats {
  count: number;
  source: 'default' | 'custom' | null;
}

// B6.1 — bumped from 2 → 4 because a 2-word overlap was matching
// generic "what is a X" phrasing against unrelated entries.
const MIN_SCORE = 4;

// Stop words and 3-letter-or-shorter words don't count toward the
// score — they're either common across all questions ("what", "is",
// "the") or too short to be discriminative ("of", "to"). Without this
// filter, "what is a hash map" trivially matches "what is a B-tree"
// with score 3.
const STOP_WORDS = new Set([
  'what','is','a','an','the','how','do','you','would',
  'your','in','of','to','and','for','can','tell','me','about','explain','describe',
  'give','us','have','with','on','are','was','were','be','been','it','this','that',
  'why','when','where','which','who','will','should','could','does','did','has','had',
]);

const LS_KEY = 'lca_custom_tier1';

let index: Tier1IndexEntry[] = [];
let currentSource: 'default' | 'custom' | null = null;

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

function rebuildIndex(entries: Tier1Entry[]): void {
  index = entries.map((entry) => ({
    entry,
    questionWords: tokenize(entry.question),
  }));
}

/**
 * loadTier1 — populate the in-memory index. Custom bank from
 * localStorage takes precedence; falls back to the bundled
 * /tier1.json. Safe to call repeatedly: re-reads localStorage every
 * time (cheap) and short-circuits the network fetch only when the
 * default bank is already loaded.
 */
export async function loadTier1(): Promise<void> {
  // Custom bank lookup first. We re-check on every call so an upload
  // → reload sequence picks up the new bank without any cache state.
  try {
    const customJson = localStorage.getItem(LS_KEY);
    if (customJson) {
      const entries = JSON.parse(customJson) as Tier1Entry[];
      if (Array.isArray(entries) && entries.length > 0) {
        rebuildIndex(entries);
        currentSource = 'custom';
        console.log(`[tier1] loaded ${entries.length} entries from custom bank`);
        return;
      }
    }
  } catch (e) {
    // Corrupted localStorage — auto-clear so we don't keep retrying
    // the same broken payload on every page load.
    console.error('[tier1] custom bank parse failed, clearing:', e);
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }

  // Default-already-loaded short-circuit. Won't hit if a custom bank
  // was uploaded since we returned above; won't hit on first call
  // since currentSource starts as null.
  if (currentSource === 'default' && index.length > 0) return;

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
    rebuildIndex(data);
    currentSource = 'default';
    console.log(`[tier1] loaded ${data.length} entries from default bank`);
  } catch (e) {
    console.error('[tier1] load failed:', e);
  }
}

/**
 * getTier1Stats — returns the loaded count and which bank (default,
 * custom, or none-yet) is currently in the index. Used by Settings
 * to render the bank status line.
 */
export function getTier1Stats(): Tier1Stats {
  return { count: index.length, source: currentSource };
}

/**
 * parseAndStripBank — validate a user-uploaded JSON blob.
 *   - must be an Array
 *   - each entry must have string `question` AND `answer`
 *   - other fields preserved (id, group, source, etc.)
 *   - `embedding` stripped from every entry (mobile doesn't use them)
 * Returns the cleaned array on success, null on any validation failure.
 */
export function parseAndStripBank(rawText: string): Tier1Entry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: Tier1Entry[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return null;
    const obj = item as Record<string, unknown>;
    if (typeof obj.question !== 'string' || typeof obj.answer !== 'string') return null;

    const copy: Record<string, unknown> = { ...obj };
    delete copy.embedding;
    out.push(copy as unknown as Tier1Entry);
  }
  return out;
}

/**
 * saveCustomBank — write the stripped entries to localStorage and
 * reload the in-memory index. Throws a friendly error on quota
 * exceeded so the caller can surface it; lets other errors bubble.
 */
export async function saveCustomBank(entries: Tier1Entry[]): Promise<void> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError')
    ) {
      throw new Error('File too large for browser storage');
    }
    throw e;
  }
  await loadTier1();
}

/**
 * clearCustomBank — remove the user's custom bank from localStorage
 * and reload the default. After this, getTier1Stats().source returns
 * 'default'.
 */
export async function clearCustomBank(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
  // Force re-fetch of the default file in case the previous source
  // was 'custom' — the default short-circuit in loadTier1 won't fire
  // because currentSource was 'custom'.
  currentSource = null;
  await loadTier1();
}

/**
 * findTier1Match — return the prepared Q&A whose question shares the
 * most *meaningful* words with the transcript, provided the overlap
 * is at least MIN_SCORE (4) such words. A "meaningful" word is one
 * not in STOP_WORDS and longer than 2 characters. Returns null on
 * miss so the caller falls through to Tier 2/3.
 *
 * Ties broken by first-encountered (insertion order), which matches
 * the order entries appear in the source bank.
 */
export function findTier1Match(transcript: string): Tier1Entry | null {
  if (!transcript || index.length === 0) return null;

  // Filter once at the top so the per-entry inner loop is just a Set
  // lookup with no extra branches.
  const meaningful = new Set(
    [...tokenize(transcript)].filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
  if (meaningful.size === 0) return null;

  let bestEntry: Tier1Entry | null = null;
  let bestScore = 0;

  for (const item of index) {
    let score = 0;
    for (const word of meaningful) {
      if (item.questionWords.has(word)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = item.entry;
    }
  }

  return bestScore >= MIN_SCORE ? bestEntry : null;
}
