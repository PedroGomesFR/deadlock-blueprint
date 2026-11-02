import React, { useEffect, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface ReportContent {
  /** Readable summary for info.txt (and the first lines of the GitHub issue). */
  info: string;
  /** Application state (localStorage) for state.json. */
  state: string;
  /** Fields of the GitHub issue form (.github/ISSUE_TEMPLATE/bug_report.yml), by field id. */
  fields: Record<string, string>;
}

/**
 * "Report a problem": builds a .zip (system info, app state, last game log if wanted) and opens a pre-filled
 * GitHub issue. GitHub can't receive a file through a URL: the player drags the .zip into the page.
 */
export const ReportDialog: React.FC<{
  onClose: () => void;
  repoUrl: string;
  logsEnabled: boolean;
  collect: () => ReportContent;
}> = ({ onClose, repoUrl, logsEnabled, collect }) => {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [hasLog, setHasLog] = useState(false);
  const [includeLog, setIncludeLog] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api?.matchLog.info().then((info) => setHasLog(Boolean(info.latest)));
  }, [api]);

  const create = async () => {
    if (!api) return;
    setBusy(true);
    setMessage('');
    try {
      const content = collect();
      const result = await api.createProblemReport({
        info: content.info,
        state: content.state,
        includeLog: hasLog && includeLog,
      });
      const params = new URLSearchParams({ template: 'bug_report.yml', ...content.fields, attachment: result.fileName });
      await api.openExternal(`${repoUrl}/issues/new?${params.toString()}`);
      setMessage(t('report.created', result.fileName));
    } catch (err) {
      setMessage(t('report.failed', err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-shade/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-surface-raised border border-accent-500/50 shadow-overlay p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-title font-extrabold text-accent-300 flex items-center gap-1.5">
            <LifeBuoy className="w-4 h-4" /> {t('report.title')}
          </h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-strong">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-body text-ink-soft leading-relaxed">{t('report.body')}</p>
        {hasLog ? (
          <label className="flex items-start gap-2 text-body text-ink cursor-pointer">
            <input type="checkbox" checked={includeLog} onChange={(e) => setIncludeLog(e.target.checked)} className="mt-0.5" />
            {t('report.includeLog')}
          </label>
        ) : (
          <p className="text-small text-ink-muted">{logsEnabled ? '' : t('report.noLog')}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={create}
            disabled={busy || !api}
            className="px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-on-accent text-body font-bold disabled:opacity-50"
          >
            {busy ? t('report.creating') : t('report.create')}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-bone/5 hover:bg-bone/10 border border-bone/10 text-body text-ink"
          >
            {t('report.cancel')}
          </button>
        </div>
        {message && <p className="text-small text-good-300 leading-relaxed">{message}</p>}
      </div>
    </div>
  );
};
