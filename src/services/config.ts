export interface ModelOption {
  id: string;
  label: string;
  preview?: boolean;
}

/** Models offered in Settings. All support Grounding with Google Maps and Google Search (checked 2026-10-08). */
export const MODEL_OPTIONS: readonly ModelOption[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (recommended)' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (legacy)' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview, slower, may be withdrawn)', preview: true },
];

export const DEFAULT_MODEL = 'gemini-3.8-flash';

export interface LocusConfig {
  apiKey: string;
  modelName: string;
}

const CONFIG_KEY = 'locus_config';
export const HISTORY_KEY = 'osint_history';

export function isKnownModel(id: string): boolean {
  return MODEL_OPTIONS.some((m) => m.id === id);
}

export function getConfig(): LocusConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocusConfig>;
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        modelName:
          typeof parsed.modelName === 'string' && isKnownModel(parsed.modelName)
            ? parsed.modelName
            : DEFAULT_MODEL,
      };
    }
  } catch (e) {
    console.error('Could not read settings from localStorage', e);
  }
  return { apiKey: '', modelName: DEFAULT_MODEL };
}

export function saveConfig(config: LocusConfig): boolean {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Could not save settings to localStorage', e);
    return false;
  }
}

export function clearLocalData(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    console.error('Could not clear localStorage', e);
  }
}
