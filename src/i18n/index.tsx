import { createContext, useContext } from 'react';
import { MESSAGES_EN } from './en';
import { MESSAGES_FR, type Messages } from './fr';
import { type Lang, localeOf } from './lang';

export type { Lang } from './lang';
export type MessageKey = keyof Messages;
type Params<K extends MessageKey> = Messages[K] extends (...args: infer A) => string ? A : [];

/** t('buy.missing', '250'): the text of `key` in the current language, with its parameters. */
export type Translate = <K extends MessageKey>(key: K, ...params: Params<K>) => string;

const TABLES: Record<Lang, Messages> = { fr: MESSAGES_FR, en: MESSAGES_EN };

export function makeTranslate(lang: Lang): Translate {
  const table = TABLES[lang];
  return ((key: MessageKey, ...params: unknown[]) => {
    const message = table[key] as string | ((...args: unknown[]) => string);
    return typeof message === 'function' ? message(...params) : message;
  }) as Translate;
}

export interface I18n {
  lang: Lang;
  t: Translate;
  /** 1 600 / 1,600 */
  formatNumber: (n: number) => string;
  /** Seconds as m:ss */
  formatDuration: (seconds: number) => string;
}

export function makeI18n(lang: Lang): I18n {
  const locale = localeOf(lang);
  return {
    lang,
    t: makeTranslate(lang),
    formatNumber: (n) => n.toLocaleString(locale),
    formatDuration: (seconds) => {
      const s = Math.max(0, Math.round(seconds));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  };
}

export const I18nContext = createContext<I18n>(makeI18n('fr'));

export const useI18n = () => useContext(I18nContext);
