import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface MemoryRecord {
  id: string;
  key: string;
  value: string;
  tags: string[];
  source: 'chat' | 'owner' | 'system';
  createdAt: string;
  updatedAt: string;
  hits: number;
}

interface MemoryFile {
  records: MemoryRecord[];
}

const MAX_RECORDS = 500;
const STOP_WORDS = new Set([
  'yang', 'dan', 'untuk', 'dengan', 'saya', 'aku', 'kau', 'ini', 'itu', 'ada', 'tak',
  'the', 'and', 'for', 'you', 'are', 'with', 'that', 'this', 'from', 'have'
]);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

const score = (record: MemoryRecord, tokens: string[]): number => {
  if (!tokens.length) return 0;
  const haystack = `${record.key} ${record.value} ${record.tags.join(' ')}`.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits / tokens.length;
};

export class MemoryStore {
  private records: MemoryRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<MemoryFile>;
      this.records = Array.isArray(parsed.records) ? parsed.records : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.records = [];
      await this.persist();
    }
  }

  list(): MemoryRecord[] {
    return [...this.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async remember(input: { key: string; value: string; tags?: string[]; source?: MemoryRecord['source'] }): Promise<MemoryRecord> {
    const key = input.key.trim().slice(0, 120);
    const value = input.value.trim().slice(0, 500);
    if (!key || !value) throw new Error('key dan value diperlukan');

    const existing = this.records.find((record) => record.key.toLowerCase() === key.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      existing.value = value;
      existing.tags = input.tags?.slice(0, 8) ?? existing.tags;
      existing.updatedAt = now;
      existing.source = input.source ?? existing.source;
      await this.persist();
      return existing;
    }

    const record: MemoryRecord = {
      id: randomUUID(),
      key,
      value,
      tags: input.tags?.slice(0, 8) ?? [],
      source: input.source ?? 'chat',
      createdAt: now,
      updatedAt: now,
      hits: 0
    };
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) {
      this.records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      this.records.length = MAX_RECORDS;
    }
    await this.persist();
    return record;
  }

  async forget(idOrKey: string): Promise<boolean> {
    const before = this.records.length;
    this.records = this.records.filter(
      (record) => record.id !== idOrKey && record.key.toLowerCase() !== idOrKey.toLowerCase()
    );
    if (this.records.length === before) return false;
    await this.persist();
    return true;
  }

  /** Keyword retrieval, good enough before embeddings land. */
  async recall(query: string, limit = 5): Promise<MemoryRecord[]> {
    const tokens = tokenize(query);
    if (!tokens.length) return [];
    const scored = this.records
      .map((record) => ({ record, value: score(record, tokens) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    for (const entry of scored) entry.record.hits += 1;
    if (scored.length) await this.persist();
    return scored.map((entry) => entry.record);
  }

  async contextFor(query: string, limit = 5): Promise<string> {
    const records = await this.recall(query, limit);
    if (!records.length) return '';
    return records.map((record) => `- ${record.key}: ${record.value}`).join('\n');
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ records: this.records }, null, 2)}\n`, 'utf8');
      await rename(temporary, this.filePath);
    });
    return this.writeChain;
  }
}
