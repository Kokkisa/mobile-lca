/**
 * tier2.ts — Tier-2 cache of past Tier-3 answers.
 *
 * Original implementation (B8/B12) used OpenAI embeddings for
 * semantic match — every transcript paid one embedding round-trip
 * (~1.5-2s) before falling through to Tier-3 on a miss. That
 * latency was eating the win the cache was supposed to provide.
 *
 * B17 replaces the embedding lookup with a Tier-1-style keyword
 * fuzzy match: tokenize, drop stop words, count overlap, threshold
 * at 3. Pure synchronous, < 1ms, no API calls. The trade-off is
 * obvious — paraphrases that an embedding model would catch
 * ("how do you handle skew" ≈ "what's your approach to data skew")
 * now require shared keywords. In practice, mid-interview repeats
 * tend to reuse the same vocabulary, so this catches the common
 * case while eliminating the latency hit on every miss.
 *
 * The in-memory cache is still mirrored to IndexedDB for cross-
 * session persistence. Old IDB entries from the embedding era still
 * have an `embedding` field on disk — we silently ignore it on read,
 * and writes from B17 onward omit it. The dead field will age out
 * via normal FIFO eviction within ~50 turns.
 */

const MAX_CACHE_SIZE = 50;
const MIN_SCORE = 3;

const DB_NAME = 'lca-cache';
const STORE_NAME = 'tier2';
const DB_VERSION = 1;

// Copy of the stop-word + short-word filter used by tiers.ts. Kept in
// sync manually — a "what is a X" transcript should never trivially
// match a cached "what is a Y" answer just because they share filler
// words.
const STOP_WORDS = new Set([
  'what','is','a','an','the','how','do','you','would',
  'your','in','of','to','and','for','can','tell','me','about','explain','describe',
  'give','us','have','with','on','are','was','were','be','been','it','this','that',
  'why','when','where','which','who','will','should','could','does','did','has','had',
]);

interface CachedAnswer {
  /** Numeric key for IDB — Date.now() + Math.random() so insertion
   *  order matches lexical order. */
  dbKey: number;
  question: string;
  answer: string;
  /** Pre-tokenised question word set — built at addToCache time so
   *  the per-match inner loop is just Set lookups. Not persisted. */
  questionTokens: Set<string>;
}

/** Shape that actually round-trips through IndexedDB — no Set, no
 *  embedding. We reconstruct questionTokens on load. */
interface DBEntry {
  dbKey: number;
  question: string;
  answer: string;
}

let cache: CachedAnswer[] = [];

function tokenizeForMatch(text: string): Set<string> {
  const all = text.toLowerCase().split(/\W+/).filter(Boolean);
  return new Set(all.filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

// ---------- IndexedDB layer ----------

/** Resolves to the open DB, or null if IDB is unavailable / failed.
 *  Memoised so we only run the open handshake once per page. */
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'dbKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.error('[tier2/db] open failed:', req.error);
        resolve(null);
      };
      req.onblocked = () => {
        console.warn('[tier2/db] open blocked — another tab holding old version');
        resolve(null);
      };
    } catch (e) {
      console.error('[tier2/db] open threw:', e);
      resolve(null);
    }
  });
  return dbPromise;
}

async function dbPut(entry: CachedAnswer): Promise<void> {
  const db = await openDB();
  if (!db) return;
  // Persist the lean shape — no questionTokens Set (not serialisable),
  // no embedding (gone since B17).
  const dbEntry: DBEntry = {
    dbKey: entry.dbKey,
    question: entry.question,
    answer: entry.answer,
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dbEntry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('[tier2/db] put failed:', e);
  }
}

async function dbDelete(dbKey: number): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(dbKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('[tier2/db] delete failed:', e);
  }
}

/**
 * loadCacheFromDB — hydrate the in-memory cache from IDB on app
 * start. Sorts by dbKey ascending so the oldest entry is at the
 * front of the array, matching the FIFO eviction direction.
 * Reconstructs questionTokens from the persisted question text;
 * any legacy `embedding` field from the pre-B17 era is silently
 * ignored.
 */
export async function loadCacheFromDB(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const entries = await new Promise<DBEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as DBEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    entries.sort((a, b) => a.dbKey - b.dbKey);
    cache = entries.map((e) => ({
      dbKey: e.dbKey,
      question: e.question,
      answer: e.answer,
      questionTokens: tokenizeForMatch(e.question),
    }));
    // Trim to cap in case the DB somehow holds more (e.g. a previous
    // eviction's delete failed).
    while (cache.length > MAX_CACHE_SIZE) {
      const evicted = cache.shift();
      if (evicted) void dbDelete(evicted.dbKey);
    }
    console.log(`[tier2] loaded ${cache.length} cached entries from IndexedDB`);
  } catch (e) {
    console.error('[tier2/db] load failed:', e);
  }
}

// Kick the open handshake off at module load so the DB is ready (or
// known to be unavailable) by the time addToCache / loadCacheFromDB
// actually need it.
void openDB();

// ---------- Public surface ----------

/**
 * addToCache — push the (question, answer) pair into the in-memory
 * array AND into IndexedDB. Pre-tokenises the question so future
 * lookups are zero-prep. Evicts oldest entries past MAX_CACHE_SIZE
 * from both layers.
 */
export function addToCache(question: string, answer: string): void {
  if (!question || !answer) return;

  const dbKey = Date.now() + Math.random();
  const entry: CachedAnswer = {
    dbKey,
    question,
    answer,
    questionTokens: tokenizeForMatch(question),
  };

  cache.push(entry);
  void dbPut(entry);

  while (cache.length > MAX_CACHE_SIZE) {
    const evicted = cache.shift();
    if (evicted) void dbDelete(evicted.dbKey);
  }
}

/**
 * findCachedAnswer — tokenize the transcript, count keyword overlap
 * against each cached question's pre-tokenised word set, return the
 * answer with the highest overlap if its score crosses MIN_SCORE (3).
 * Pure sync, no API call, sub-millisecond on a 50-entry cache.
 */
export function findCachedAnswer(transcript: string): string | null {
  if (!transcript || cache.length === 0) return null;

  const transcriptTokens = tokenizeForMatch(transcript);
  if (transcriptTokens.size === 0) return null;

  let bestAnswer: string | null = null;
  let bestScore = 0;

  for (const entry of cache) {
    let score = 0;
    for (const word of transcriptTokens) {
      if (entry.questionTokens.has(word)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = entry.answer;
    }
  }

  return bestScore >= MIN_SCORE ? bestAnswer : null;
}
