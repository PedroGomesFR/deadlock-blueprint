import React from 'react';
import { ShieldCheck, ScrollText } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import { LanguageSwitch } from './SettingsModal';

/** First launch: interface language, what the app does, and the opt-in for the game logs. */
export const OnboardingModal: React.FC<{
  onLangChange: (lang: Lang) => void;
  onDone: (enableLogs: boolean) => void;
}> = ({ onLangChange, onDone }) => {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[60] bg-shade/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-surface-raised border border-accent-500/60 shadow-overlay p-5 space-y-4">
        <div className="flex items-center gap-3">
          <img src="./icons/upscalemedia-transformed.png" alt="" className="w-12 h-12" draggable={false} />
          <h2 className="font-display tracking-display text-heading text-accent-300">{t('onboarding.title')}</h2>
        </div>

        <div className="space-y-1.5">
          <span className="text-small font-bold uppercase text-ink-muted">{t('onboarding.language')}</span>
          <LanguageSwitch onChange={onLangChange} />
        </div>

        <p className="text-body text-ink leading-relaxed flex gap-2">
          <ShieldCheck className="w-4 h-4 text-good-400 shrink-0 mt-0.5" />
          <span>{t('onboarding.intro')}</span>
        </p>
        <p className="text-small text-ink-muted">{t('onboarding.resolutionNote')}</p>

        <div className="p-3 rounded-xl bg-shade/40 border border-bone/10 space-y-2">
          <h3 className="text-body font-bold text-accent-300 flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" /> {t('onboarding.logsTitle')}
          </h3>
          <p className="text-small text-ink-soft leading-relaxed">{t('onboarding.logsBody')}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onDone(true)}
              className="px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-on-accent text-body font-bold"
            >
              {t('onboarding.enableLogs')}
            </button>
            <button
              onClick={() => onDone(false)}
              className="px-3 py-1.5 rounded-lg bg-bone/5 hover:bg-bone/10 border border-bone/10 text-body font-semibold text-ink"
            >
              {t('onboarding.noLogs')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
