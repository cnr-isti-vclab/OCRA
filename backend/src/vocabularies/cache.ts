export interface VocabularyCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete?(key: string): Promise<void>;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** Small initial cache implementation; the interface can be backed by Redis later. */
export class InMemoryVocabularyCache implements VocabularyCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + Math.max(0, ttlMs),
    });
  }
}
