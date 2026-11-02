import React from 'react';
import { ShieldCheck, ScrollText } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import { LanguageSwitch } from './SettingsModal';
import { Button, Card, ModalShell, SectionHeader } from '../ui';

/** First launch: interface language, what the app does, and the opt-in for the game logs. */
export const OnboardingModal: React.FC<{
  onLangChange: (lang: Lang) => void;
  onDone: (enableLogs: boolean) => void;
}> = ({ onLangChange, onDone }) => {
  const { t } = useI18n();
  return (
    <ModalShell
      layer="top"
      className="p-5 space-y-4"
      title={t('onboarding.title')}
      header={
        <div className="flex items-center gap-3">
          <img src="./icons/upscalemedia-transformed.png" alt="" className="w-12 h-12" draggable={false} />
          <h2 className="font-display text-heading tracking-display text-ink-strong">{t('onboarding.title')}</h2>
        </div>
      }
    >
      <div className="space-y-1.5">
        <span className="block text-small font-bold uppercase tracking-caps text-ink-muted">{t('onboarding.language')}</span>
        <LanguageSwitch onChange={onLangChange} />
      </div>

      <p className="text-body text-ink leading-relaxed flex gap-2">
        <ShieldCheck className="w-4 h-4 text-good-400 shrink-0 mt-0.5" />
        <span>{t('onboarding.intro')}</span>
      </p>
      <p className="text-small text-ink-muted">{t('onboarding.resolutionNote')}</p>

      <Card tone="well" className="p-3 space-y-2">
        <SectionHeader icon={<ScrollText className="w-3.5 h-3.5" />} title={t('onboarding.logsTitle')} />
        <p className="text-small text-ink-soft leading-relaxed">{t('onboarding.logsBody')}</p>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="primary" onClick={() => onDone(true)}>
            {t('onboarding.enableLogs')}
          </Button>
          <Button onClick={() => onDone(false)}>{t('onboarding.noLogs')}</Button>
        </div>
      </Card>
    </ModalShell>
  );
};
