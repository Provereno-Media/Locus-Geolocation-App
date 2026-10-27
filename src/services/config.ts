import type { GroundingTool } from './geo/types';

export interface ModelOption {
  id: string;
  label: string;
  preview?: boolean;
}

/**
 * Models offered in Settings. All support Grounding with Google Maps and Google Search.
 * Gemini 3.x grounding requires billing. Gemini 2.5 Flash has free grounding quotas
 * for eligible existing projects; Google restricts access for new projects.
 * Saved choices outside this list fall back to DEFAULT_MODEL.
 */
export const FREE_MODEL = 'gemini-2.5-flash';

export const MODEL_OPTIONS: readonly ModelOption[] = [
  { id: FREE_MODEL, label: 'Gemini 2.5 Flash (Free, eligible existing projects)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (recommended with billing)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview, slower, may be withdrawn)', preview: true },
];

export const DEFAULT_MODEL = 'gemini-3.6-flash';

/** Search is the tested free-tier path; Maps quotas may differ for the same key. */
export function defaultGroundingForModel(modelName: string): GroundingTool {
  return modelName === FREE_MODEL ? 'search' : 'maps';
}

export interface LocusConfig {
  apiKey: string;
  modelName: string;
  /** true: key kept in localStorage across sessions; false: only in this tab's sessionStorage. */
  rememberKey: boolean;
}

export const DEFAULT_CONFIG: LocusConfig = { apiKey: '', modelName: DEFAULT_MODEL, rememberKey: true };

const CONFIG_KEY = 'locus_config';
const SESSION_KEY = 'locus_session_key';
export const HISTORY_KEY = 'osint_history';

// Whitespace plus invisible characters that come along when a key is copied from
// chats or documents (zero-width spaces and joiners, word joiner, BOM, soft hyphen).
const INVISIBLE = /[\s\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** Removes whitespace and invisible characters picked up when copying a key. */
export function normalizeApiKey(raw: string): string {
  return raw.replace(INVISIBLE, '');
}

/**
 * Only checks what the browser needs to send the key as a header: visible ASCII.
 * Key formats differ (e.g. `AIza…`, `AQ.…`), so the exact alphabet is not enforced.
 */
export function hasValidKeyChars(key: string): boolean {
  return /^[\x21-\x7E]+$/.test(key);
}

export function isKnownModel(id: string): boolean {
  return MODEL_OPTIONS.some((m) => m.id === id);
}

function readSessionKey(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? '';
  } catch {
    return '';
  }
}

export function getConfig(): LocusConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocusConfig>;
      const rememberKey = parsed.rememberKey !== false;
      return {
        apiKey: normalizeApiKey(rememberKey ? (typeof parsed.apiKey === 'string' ? parsed.apiKey : '') : readSessionKey()),
        modelName:
          typeof parsed.modelName === 'string' && isKnownModel(parsed.modelName)
            ? parsed.modelName
            : DEFAULT_MODEL,
        rememberKey,
      };
    }
  } catch (e) {
    console.error('Could not read settings from localStorage', e);
  }
  return { ...DEFAULT_CONFIG, apiKey: normalizeApiKey(readSessionKey()) };
}

export function saveConfig(config: LocusConfig): boolean {
  try {
    if (config.rememberKey) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      const { apiKey, ...rest } = config;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(rest));
      sessionStorage.setItem(SESSION_KEY, apiKey);
    }
    return true;
  } catch (e) {
    console.error('Could not save settings to browser storage', e);
    return false;
  }
}

export function clearLocalData(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(HISTORY_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('Could not clear browser storage', e);
  }
}
