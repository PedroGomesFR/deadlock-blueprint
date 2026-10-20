/** Interface language, shared by the main window and the overlay through localStorage. */
export type Lang = 'fr' | 'en' | 'it';

export const LANGS: readonly Lang[] = ['en', 'fr', 'it'];

export const LANG_STORAGE_KEY = 'dl_lang';

export function readStoredLang(): Lang | null {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return LANGS.includes(value as Lang) ? (value as Lang) : null;
  } catch {
    return null;
  }
}

/** Saved choice, else the system language: French or Italian for French or Italian systems, English for everything else. */
export function detectLang(): Lang {
  const stored = readStoredLang();
  if (stored) return stored;
  const system = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  return system.startsWith('fr') ? 'fr' : system.startsWith('it') ? 'it' : 'en';
}

export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore
  }
}

/** Locale used to format numbers and times. */
export const localeOf = (lang: Lang) => ({ fr: 'fr-FR', en: 'en-US', it: 'it-IT' })[lang];
