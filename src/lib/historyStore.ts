import { HISTORY_KEY } from '../services/config';
import { normalizeStoredResult, type GeolocationResult } from '../services/geo';

export interface HistoryItem {
  id: string;
  image: string;
  result: GeolocationResult;
  timestamp: number;
}

export const MAX_HISTORY = 20;

const DB_NAME = 'locus';
const DB_VERSION = 1;
const STORE = 'history';
const ENABLED_KEY = 'locus_history_enabled';

/** Only inline base64 images: an imported file must not make the browser load anything. */
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;

function parseItem(item: unknown): HistoryItem | null {
  if (!item || typeof item !== 'object') return null;
  const { id, image, timestamp, result } = item as Record<string, unknown>;
  const normalized = normalizeStoredResult(result);
  if (typeof id !== 'string' || id === '' || typeof image !== 'string' || !IMAGE_DATA_URL.test(image) || !normalized) {
    return null;
  }
  return { id, image, timestamp: typeof timestamp === 'number' ? timestamp : 0, result: normalized };
}

/** Newest first, one entry per id, at most MAX_HISTORY. `first` wins on duplicate ids. */
export function mergeHistory(first: HistoryItem[], second: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  return [...first, ...second]
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY);
}

export function parseLegacyHistory(raw: string | null): HistoryItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => parseItem(item) ?? []);
  } catch {
    return [];
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function runTx(db: IDBDatabase, fill: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    fill(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function readAll(db: IDBDatabase): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Moves history saved by older versions from localStorage into IndexedDB, then removes it there. */
async function migrateLegacy(db: IDBDatabase): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(HISTORY_KEY);
  } catch {
    return;
  }
  if (raw === null) return;
  const legacy = parseLegacyHistory(raw);
  await runTx(db, (store) => legacy.forEach((item) => store.put(item)));
  localStorage.removeItem(HISTORY_KEY);
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const db = await openDb();
    try {
      await migrateLegacy(db);
      const items = (await readAll(db)).flatMap((item) => parseItem(item) ?? []);
      return mergeHistory(items, []);
    } finally {
      db.close();
    }
  } catch (e) {
    console.error('Could not read history from IndexedDB', e);
    return [];
  }
}

/** Replaces the stored history with `items`. */
export async function saveHistory(items: HistoryItem[]): Promise<void> {
  try {
    const db = await openDb();
    try {
      await runTx(db, (store) => {
        store.clear();
        items.forEach((item) => store.put(item));
      });
    } finally {
      db.close();
    }
  } catch (e) {
    console.error('Could not save history to IndexedDB', e);
  }
}

export function isHistoryEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setHistoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch (e) {
    console.error('Could not save history preference', e);
  }
}

export const HISTORY_EXPORT_FORMAT = 'locus-history';

/** Backup file with the analyses and their images, newest first. */
export function buildHistoryExport(items: HistoryItem[], exportedAt = new Date()): string {
  return `${JSON.stringify({ format: HISTORY_EXPORT_FORMAT, version: 1, exportedAt: exportedAt.toISOString(), items }, null, 2)}\n`;
}

export interface HistoryImport {
  items: HistoryItem[];
  /** Records in the file that could not be read */
  skipped: number;
}

/** Reads a file made by buildHistoryExport, or a bare array of history records. Throws on other files. */
export function parseHistoryImport(text: string): HistoryImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  let records: unknown;
  if (Array.isArray(raw)) {
    records = raw;
  } else if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).format === HISTORY_EXPORT_FORMAT) {
    const { version, items } = raw as Record<string, unknown>;
    if (version !== 1) throw new Error(`Unsupported history file version: ${String(version)}.`);
    records = items;
  }
  if (!Array.isArray(records)) throw new Error('The file is not a LOCUS history export.');
  const items = records.flatMap((record) => parseItem(record) ?? []);
  return { items, skipped: records.length - items.length };
}
