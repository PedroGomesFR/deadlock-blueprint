import React, { useState } from 'react';
import { ExternalLink, FolderOpen, Github, Languages, LifeBuoy, RefreshCw, ScrollText, Trash2, ZoomIn } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import type { AppInfo, UpdateStatus } from '../electron';
import { getDataInfo } from '../data/dataSource';
import { localeOf } from '../i18n/lang';
import { Button, ModalShell, SectionHeader, SegmentedControl } from '../ui';
import type { UiScale } from '../App';

interface SettingsModalProps {
  onClose: () => void;
  onLangChange: (lang: Lang) => void;
  logsEnabled: boolean;
  onLogsChange: (enabled: boolean) => void;
  appInfo: AppInfo | null;
  updateStatus: UpdateStatus;
  uiScale: UiScale;
  onUiScaleChange: (scale: UiScale) => void;
  onReport: () => void;
}

export const LanguageSwitch: React.FC<{ onChange: (lang: Lang) => void }> = ({ onChange }) => {
  const { lang } = useI18n();
  return (
    <SegmentedControl
      value={lang}
      onChange={onChange}
      options={[
        { value: 'en', label: 'English' },
        { value: 'fr', label: 'Français' },
        { value: 'it', label: 'Italiano' },
      ]}
    />
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="space-y-2 border-t border-bone/10 pt-3 first:border-t-0 first:pt-0">
    <SectionHeader icon={icon} title={title} />
    {children}
  </section>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onLangChange,
  logsEnabled,
  onLogsChange,
  appInfo,
  updateStatus,
  uiScale,
  onUiScaleChange,
  onReport,
}) => {
  const { t, lang } = useI18n();
  const [logsMessage, setLogsMessage] = useState('');
  const [checkedManually, setCheckedManually] = useState(false);
  const dataInfo = getDataInfo();
  const dataDate = dataInfo.generatedAt ? new Date(dataInfo.generatedAt).toLocaleDateString(localeOf(lang)) : '?';
  const api = window.electronAPI;

  const updateLine = (() => {
    switch (updateStatus.state) {
      case 'checking':
        return t('update.checking');
      case 'none':
        return checkedManually ? t('update.upToDate') : '';
      case 'available':
        return `${t('update.available', updateStatus.version)} — ${t('update.portable')}`;
      case 'downloading':
        return t('update.downloading', updateStatus.version);
      case 'ready':
        return t('update.ready', updateStatus.version);
      case 'error':
        return checkedManually ? t('update.failed') : '';
      default:
        return '';
    }
  })();

  return (
    <ModalShell title={t('settings.title')} onClose={onClose} closeLabel={t('settings.close')}>
      <Section icon={<Languages className="w-3.5 h-3.5" />} title={t('settings.language')}>
        <LanguageSwitch onChange={onLangChange} />
      </Section>

      <Section icon={<ZoomIn className="w-3.5 h-3.5" />} title={t('settings.uiSize')}>
        <SegmentedControl
          value={uiScale}
          onChange={onUiScaleChange}
          options={[
            { value: 'auto', label: t('settings.uiSizeAuto') },
            { value: '100', label: '100%' },
            { value: '115', label: '115%' },
            { value: '130', label: '130%' },
          ]}
        />
      </Section>

      <Section icon={<ScrollText className="w-3.5 h-3.5" />} title={t('settings.gameLogs')}>
        <p className="text-small text-ink-soft leading-relaxed">{t('settings.gameLogsDesc')}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl
            value={logsEnabled}
            onChange={onLogsChange}
            options={[
              { value: true, label: t('settings.gameLogsOn') },
              { value: false, label: t('settings.gameLogsOff'), tone: 'neutral' },
            ]}
          />
          {api && (
            <>
              <Button icon={<FolderOpen className="w-3.5 h-3.5" />} onClick={() => api.matchLog.openFolder()}>
                {t('settings.openLogs')}
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={async () => {
                  await api.matchLog.deleteAll();
                  setLogsMessage(t('settings.logsDeleted'));
                }}
              >
                {t('settings.deleteLogs')}
              </Button>
            </>
          )}
        </div>
        {logsMessage && <p className="text-small text-good-300">{logsMessage}</p>}
      </Section>

      <Section icon={<RefreshCw className="w-3.5 h-3.5" />} title={t('settings.updates')}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body text-ink">{t('settings.version', appInfo?.version ?? '?')}</span>
          {api && (
            <Button
              onClick={() => {
                setCheckedManually(true);
                api.updates.check();
              }}
              disabled={updateStatus.state === 'checking'}
            >
              {t('update.check')}
            </Button>
          )}
          {updateStatus.state === 'available' && api && (
            <Button variant="primary" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => api.openExternal(updateStatus.url)}>
              {t('update.download')}
            </Button>
          )}
          {updateStatus.state === 'ready' && api && (
            <Button variant="success" onClick={() => api.updates.install()}>
              {t('update.restart')}
            </Button>
          )}
        </div>
        {updateLine && <p className="text-small text-ink-muted">{updateLine}</p>}
        <p className="text-small text-ink-muted">
          <strong className="text-ink-soft">{t('settings.data')}</strong> {t('settings.dataInfo', dataDate, dataInfo.origin === 'online')}
        </p>
      </Section>

      <Section icon={<Github className="w-3.5 h-3.5" />} title={t('settings.about')}>
        <p className="text-small text-ink-soft leading-relaxed">{t('settings.privacy')}</p>
        <p className="text-small text-ink-muted leading-relaxed">{t('settings.aboutBody')}</p>
        {api && appInfo && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button icon={<Github className="w-3.5 h-3.5" />} onClick={() => api.openExternal(appInfo.repoUrl)}>
              {t('settings.github')}
            </Button>
            <Button icon={<LifeBuoy className="w-3.5 h-3.5" />} onClick={onReport}>
              {t('diag.reportButton')}
            </Button>
          </div>
        )}
      </Section>
    </ModalShell>
  );
};
