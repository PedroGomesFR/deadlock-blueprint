import React, { useState } from 'react';
import { ExternalLink, FolderOpen, Github, Languages, LifeBuoy, RefreshCw, ScrollText, Trash2, X } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import type { AppInfo, UpdateStatus } from '../electron';
import { getDataInfo } from '../data/dataSource';
import { localeOf } from '../i18n/lang';

interface SettingsModalProps {
  onClose: () => void;
  onLangChange: (lang: Lang) => void;
  logsEnabled: boolean;
  onLogsChange: (enabled: boolean) => void;
  appInfo: AppInfo | null;
  updateStatus: UpdateStatus;
  onReport: () => void;
}

export const LanguageSwitch: React.FC<{ onChange: (lang: Lang) => void }> = ({ onChange }) => {
  const { lang } = useI18n();
  return (
    <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10 w-fit">
      {(
        [
          ['en', 'English'],
          ['fr', 'Français'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1 rounded-md text-xs font-bold transition ${
            lang === id ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="space-y-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
      {icon} {title}
    </h3>
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#181520] border border-amber-500/50 shadow-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-extrabold uppercase tracking-wider text-amber-300">{t('settings.title')}</h2>
          <button onClick={onClose} title={t('settings.close')} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Section icon={<Languages className="w-3.5 h-3.5" />} title={t('settings.language')}>
          <LanguageSwitch onChange={onLangChange} />
        </Section>

        <Section icon={<ScrollText className="w-3.5 h-3.5" />} title={t('settings.gameLogs')}>
          <p className="text-[11px] text-slate-300 leading-relaxed">{t('settings.gameLogsDesc')}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
              {([true, false] as const).map((on) => (
                <button
                  key={String(on)}
                  onClick={() => onLogsChange(on)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    logsEnabled === on ? (on ? 'bg-emerald-500 text-black' : 'bg-slate-500 text-black') : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {on ? t('settings.gameLogsOn') : t('settings.gameLogsOff')}
                </button>
              ))}
            </div>
            {api && (
              <>
                <button
                  onClick={() => api.matchLog.openFolder()}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> {t('settings.openLogs')}
                </button>
                <button
                  onClick={async () => {
                    await api.matchLog.deleteAll();
                    setLogsMessage(t('settings.logsDeleted'));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-950/60 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t('settings.deleteLogs')}
                </button>
              </>
            )}
          </div>
          {logsMessage && <p className="text-[11px] text-emerald-300">{logsMessage}</p>}
        </Section>

        <Section icon={<RefreshCw className="w-3.5 h-3.5" />} title={t('settings.updates')}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-200">{t('settings.version', appInfo?.version ?? '?')}</span>
            {api && (
              <button
                onClick={() => {
                  setCheckedManually(true);
                  api.updates.check();
                }}
                disabled={updateStatus.state === 'checking'}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-50"
              >
                {t('update.check')}
              </button>
            )}
            {updateStatus.state === 'available' && api && (
              <button
                onClick={() => api.openExternal(updateStatus.url)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('update.download')}
              </button>
            )}
            {updateStatus.state === 'ready' && api && (
              <button
                onClick={() => api.updates.install()}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
              >
                {t('update.restart')}
              </button>
            )}
          </div>
          {updateLine && <p className="text-[11px] text-slate-400">{updateLine}</p>}
          <p className="text-[11px] text-slate-400">
            <strong className="text-slate-300">{t('settings.data')}</strong> {t('settings.dataInfo', dataDate, dataInfo.origin === 'online')}
          </p>
        </Section>

        <Section icon={<Github className="w-3.5 h-3.5" />} title={t('settings.about')}>
          <p className="text-[11px] text-slate-300 leading-relaxed">{t('settings.privacy')}</p>
          <p className="text-[11px] text-slate-400 leading-relaxed">{t('settings.aboutBody')}</p>
          {api && appInfo && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => api.openExternal(appInfo.repoUrl)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
              >
                <Github className="w-3.5 h-3.5" /> {t('settings.github')}
              </button>
              <button
                onClick={onReport}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
              >
                <LifeBuoy className="w-3.5 h-3.5" /> {t('diag.reportButton')}
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};
