import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY } from '../services/config';
import { normalizeStoredResult } from '../services/geo';
import {
  buildHistoryExport,
  isHistoryEnabled,
  loadHistory,
  MAX_HISTORY,
  mergeHistory,
  parseHistoryImport,
  saveHistory,
  setHistoryEnabled,
  type HistoryItem,
} from './historyStore';

const legacyResult = {
  locationName: 'Tallinn, Estonia',
  coordinates: { lat: 59.437, lng: 24.7536 },
  confidence: 0.8,
  evidence: ['Estonian text on sign'],
  description: 'Old Town',
  extractedText: [],
  identifiedSymbols: [],
  searchQueriesExecuted: ['Raekoja plats Tallinn'],
};

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let local: MemoryStorage;

function item(id: string, timestamp: number): HistoryItem {
  return { id, image: 'data:image/png;base64,AAAA', timestamp, result: normalizeStoredResult(legacyResult)! };
}

beforeEach(() => {
  local = new MemoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe('history store', () => {
  it('starts empty', async () => {
    expect(await loadHistory()).toEqual([]);
  });

  it('moves legacy localStorage history into IndexedDB and removes it from localStorage', async () => {
    local.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { id: 'a', image: 'data:image/png;base64,AAAA', timestamp: 1, result: legacyResult },
        { id: 'b', image: 'data:image/png;base64,BBBB', timestamp: 2, result: legacyResult },
        { id: 'broken' },
      ]),
    );
    const loaded = await loadHistory();
    expect(loaded.map((i) => i.id)).toEqual(['b', 'a']);
    expect(local.getItem(HISTORY_KEY)).toBeNull();
    expect((await loadHistory()).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('drops unreadable legacy history without failing', async () => {
    local.setItem(HISTORY_KEY, '{not json');
    expect(await loadHistory()).toEqual([]);
    expect(local.getItem(HISTORY_KEY)).toBeNull();
  });

  it('replaces stored history on save', async () => {
    const a = item('a', 1);
    const b = item('b', 2);
    await saveHistory([a, b]);
    expect((await loadHistory()).map((i) => i.id)).toEqual(['b', 'a']);
    await saveHistory([a]);
    expect((await loadHistory()).map((i) => i.id)).toEqual(['a']);
    await saveHistory([]);
    expect(await loadHistory()).toEqual([]);
  });

  it('merges by id, newest first, capped', async () => {
    const a = item('a', 1);
    const items = Array.from({ length: MAX_HISTORY + 5 }, (_, n) => ({ ...a, id: `x${n}`, timestamp: n }));
    const merged = mergeHistory(items.slice(0, 3), items);
    expect(merged).toHaveLength(MAX_HISTORY);
    expect(new Set(merged.map((i) => i.id)).size).toBe(MAX_HISTORY);
    expect(merged[0].timestamp).toBe(MAX_HISTORY + 4);
  });

  it('remembers whether saving is enabled', () => {
    expect(isHistoryEnabled()).toBe(true);
    setHistoryEnabled(false);
    expect(isHistoryEnabled()).toBe(false);
  });
});

describe('history export and import', () => {
  it('round-trips through the export file', () => {
    const items = [item('b', 2), item('a', 1)];
    const file = buildHistoryExport(items, new Date('2026-10-17T10:00:00Z'));
    expect(JSON.parse(file)).toMatchObject({ format: 'locus-history', version: 1, exportedAt: '2026-10-17T10:00:00.000Z' });
    expect(parseHistoryImport(file)).toEqual({ items, skipped: 0 });
  });

  it('accepts a bare array of records, such as old localStorage history', () => {
    const imported = parseHistoryImport(JSON.stringify([{ id: 'a', image: 'data:image/png;base64,AAAA', timestamp: 1, result: legacyResult }]));
    expect(imported.items.map((i) => i.id)).toEqual(['a']);
  });

  it('skips records with images that are not inline data or with missing fields', () => {
    const records = [
      item('ok', 1),
      { ...item('remote', 2), image: 'https://example.org/pixel.png' },
      { ...item('script', 3), image: 'javascript:alert(1)' },
      { ...item('svg', 4), image: 'data:image/svg+xml;utf8,<svg onload="x"/>' },
      { id: 'broken' },
    ];
    expect(parseHistoryImport(JSON.stringify(records))).toMatchObject({ skipped: 4 });
  });

  it('keeps only web links among sources', () => {
    const result = {
      ...legacyResult,
      sources: [
        { uri: 'javascript:alert(1)', title: 'x', type: 'web' },
        { uri: 'https://example.org/a', title: 'Example', type: 'web' },
      ],
    };
    const [imported] = parseHistoryImport(JSON.stringify([{ id: 'a', image: 'data:image/png;base64,AAAA', timestamp: 1, result }])).items;
    expect(imported.result.sources).toEqual([{ uri: 'https://example.org/a', title: 'Example', type: 'web' }]);
  });

  it('rejects files that are not history exports', () => {
    expect(() => parseHistoryImport('{not json')).toThrow('not valid JSON');
    expect(() => parseHistoryImport('{"type":"FeatureCollection"}')).toThrow('not a LOCUS history export');
    expect(() => parseHistoryImport('{"format":"locus-history","version":2,"items":[]}')).toThrow('Unsupported');
  });
});
