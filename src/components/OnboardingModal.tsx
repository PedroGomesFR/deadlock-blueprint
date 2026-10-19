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
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#181520] border border-amber-500/60 shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <img src="./icons/upscalemedia-transformed.png" alt="" className="w-12 h-12" draggable={false} />
          <h2 className="font-display text-base font-extrabold text-amber-300">{t('onboarding.title')}</h2>
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase text-slate-400">{t('onboarding.language')}</span>
          <LanguageSwitch onChange={onLangChange} />
        </div>

        <p className="text-xs text-slate-200 leading-relaxed flex gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{t('onboarding.intro')}</span>
        </p>
        <p className="text-[11px] text-slate-400">{t('onboarding.resolutionNote')}</p>

        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" /> {t('onboarding.logsTitle')}
          </h3>
          <p className="text-[11px] text-slate-300 leading-relaxed">{t('onboarding.logsBody')}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onDone(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
            >
              {t('onboarding.enableLogs')}
            </button>
            <button
              onClick={() => onDone(false)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200"
            >
              {t('onboarding.noLogs')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
