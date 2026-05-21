/**
 * tier2.ts — Tier-2 semantic cache, persistent across reloads.
 *
 * Every Tier-3 answer is embedded and stashed in memory; when the next
 * transcript arrives, we embed it and cosine-match against the cache.
 * If a stored question is similar enough (>= 0.85), we serve its
 * answer instantly instead of paying for another LLM round-trip.
 *
 * B12 — the cache is now write-through to IndexedDB, so it survives
 * page reloads and PWA cold starts. The in-memory array is still the
 * source of truth for matching (synchronous, fast); IDB is the
 * persistent backing store. FIFO eviction past 50 entries drops the
 * oldest from both layers. IDB ops are best-effort: any failure is
 * logged and swallowed so the memory cache keeps working.
 */

interface CachedAnswer {
  /** Numeric key for IDB — Date.now() + Math.random() so insertion
   *  order matches lexical order. Set before the IDB put, so it's
   *  always defined even if the IDB write later fails. */
  dbKey: number;
  question: string;
  answer: string;
  embedding: number[];
}

const MAX_CACHE_SIZE = 50;
const SIMILARITY_THRESHOLD = 0.85;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';

const DB_NAME = 'lca-cache';
const STORE_NAME = 'tier2';
const DB_VERSION = 1;

let cache: CachedAnswer[] = [];

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
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
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
 * Safe to call multiple times; later calls just re-read the store.
 */
export async function loadCacheFromDB(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const entries = await new Promise<CachedAnswer[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as CachedAnswer[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    entries.sort((a, b) => a.dbKey - b.dbKey);
    cache = entries;
    // Trim to cap in case the DB somehow holds more (e.g. a previous
    // eviction's delete failed). Memory is the lookup surface, so it
    // must stay bounded.
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
 * Standard cosine similarity. Returns 0 if either vector is degenerate
 * (zero magnitude or mismatched length).
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
 * network blip).
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
 * addToCache — embed the question, push the (question, answer,
 * embedding) triple into the in-memory array AND into IndexedDB.
 * Evicts oldest entries past MAX_CACHE_SIZE from both layers. Silent
 * on any failure — the cache is best-effort.
 */
export async function addToCache(
  question: string,
  answer: string,
  openaiApiKey: string,
): Promise<void> {
  if (!openaiApiKey || !question || !answer) return;
  const embedding = await embedText(question, openaiApiKey);
  if (!embedding) return;

  // Date.now() + Math.random() — milliseconds plus a sub-ms fraction,
  // so two adds in the same tick still produce distinct, monotonically
  // increasing keys. Numeric key sorts cleanly for FIFO eviction.
  const dbKey = Date.now() + Math.random();
  const entry: CachedAnswer = { dbKey, question, answer, embedding };

  cache.push(entry);
  void dbPut(entry);

  while (cache.length > MAX_CACHE_SIZE) {
    const evicted = cache.shift();
    if (evicted) void dbDelete(evicted.dbKey);
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
