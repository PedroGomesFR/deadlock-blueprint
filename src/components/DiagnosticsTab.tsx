import React from 'react';
import { Camera, FolderOpen, LifeBuoy, Terminal } from 'lucide-react';
import { useI18n } from '../i18n';
import type { ElectronSourceInfo } from '../electron';
import type { VisionDetectionResult } from '../services/visionScanner';
import { isSupportedFormat } from '../services/matchTracker';
import type { DeadlockHero } from '../data/deadlockData';

interface DiagnosticsTabProps {
  heroes: DeadlockHero[];
  sources: ElectronSourceInfo[];
  selectedSourceId: string;
  onSelectSource: (id: string) => void;
  onScanNow: () => void;
  onReport: () => void;
  lastCaptureUrl: string | null;
  lastDetection: VisionDetectionResult | null;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1 border-b border-bone/5 text-body">
    <span className="text-ink-muted shrink-0">{label}</span>
    <span className="text-ink text-right break-words min-w-0">{children}</span>
  </div>
);

/** What the scanner sees, live while this tab is open (previews, portraits, inventory slots, raw logs). */
export const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({
  heroes,
  sources,
  selectedSourceId,
  onSelectSource,
  onScanNow,
  onReport,
  lastCaptureUrl,
  lastDetection,
}) => {
  const { t } = useI18n();
  const heroName = (id: string | null | undefined) => (id ? heroes.find((h) => h.id === id)?.name ?? id : '?');
  const d = lastDetection;
  const slotsLine = (slots: (string | null)[] | undefined, mine = -1) =>
    slots ? slots.map((id, i) => `${i + 1}:${heroName(id)}${i === mine ? '★' : ''}`).join('  ') : '—';
  const sourceButton = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-body font-bold border transition ${
      active ? 'bg-accent-500 text-on-accent border-accent-400' : 'bg-shade/50 text-ink-soft border-bone/10 hover:border-bone/30'
    }`;

  return (
    <div className="space-y-3">
      <div className="p-3.5 rounded-xl bg-surface-panel border border-accent-500/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-body tracking-display text-accent-300 flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-accent-400" /> {t('diag.title')}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {window.electronAPI && (
              <button
                onClick={() => window.electronAPI?.matchLog.openFolder()}
                title={t('diag.logsTitle')}
                className="px-3 py-1.5 rounded-lg bg-bone/5 hover:bg-bone/10 text-body font-semibold text-ink-soft border border-bone/10 flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" /> {t('diag.logsButton')}
              </button>
            )}
            <button
              onClick={onReport}
              className="px-3 py-1.5 rounded-lg bg-bone/5 hover:bg-bone/10 text-body font-semibold text-ink-soft border border-bone/10 flex items-center gap-1.5"
            >
              <LifeBuoy className="w-3.5 h-3.5" /> {t('diag.reportButton')}
            </button>
            <button
              onClick={onScanNow}
              className="px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-on-accent font-bold text-body flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              {t('diag.scanNow')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-small text-ink-muted font-semibold mr-1">{t('diag.target')}</span>
          <button onClick={() => onSelectSource('')} className={sourceButton(selectedSourceId === '')}>
            {t('diag.auto')}
          </button>
          {sources.map((src) => (
            <button key={src.id} onClick={() => onSelectSource(src.id)} className={sourceButton(selectedSourceId === src.id)}>
              {t('diag.screen', src.name, src.width ?? 0, src.height ?? 0)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="aspect-video rounded-lg bg-shade/80 border border-bone/10 overflow-hidden flex items-center justify-center">
            {lastCaptureUrl ? (
              <img src={lastCaptureUrl} alt={t('diag.captured')} className="w-full h-full object-contain" />
            ) : (
              <span className="text-body text-ink-faint">{t('diag.noScan')}</span>
            )}
          </div>
          <div className="aspect-video rounded-lg bg-shade/80 border border-bone/10 overflow-hidden flex items-center justify-center">
            {d?.hudPreviewUrl ? (
              <img src={d.hudPreviewUrl} alt={t('diag.hud')} className="w-full h-full object-contain" />
            ) : (
              <span className="text-body text-ink-faint">{t('diag.waiting')}</span>
            )}
          </div>
        </div>

        {d && (
          <div className="space-y-0.5">
            <Row label={t('diag.source')}>{d.isDeadlockWindow ? t('diag.gameWindow', d.sourceName) : d.sourceName}</Row>
            <Row label={t('diag.frame')}>
              <span className={isSupportedFormat(d.frameWidth, d.frameHeight) ? 'text-good-300' : 'text-bad-300 font-bold'}>
                {d.frameWidth}×{d.frameHeight}
              </span>
            </Row>
            <Row label={t('diag.mode')}>
              {d.shopOpen ? t('diag.mode.shop') : d.hudVisible ? t('diag.mode.hud') : t('diag.mode.other')}
            </Row>
            <Row label={t('diag.allies')}>{slotsLine(d.allySlots, d.mySlotIndex)}</Row>
            <Row label={t('diag.enemies')}>{slotsLine(d.enemySlots)}</Row>
            <Row label={t('diag.inventory')}>
              {(d.inventorySlots ?? [])
                .map((s) =>
                  s.state === 'empty' ? '·' : s.state === 'locked' ? '🔒' : s.state === 'unknown' ? `?${s.category ?? ''}` : `${s.state === 'cooldown' ? '⏳' : ''}${s.itemId}`
                )
                .join('  ')}
            </Row>
            {d.detectedSouls !== undefined && <Row label={t('souls.unit')}>{d.detectedSouls}</Row>}
            <details className="pt-1">
              <summary className="text-small text-ink-muted cursor-pointer">{t('diag.details')}</summary>
              <pre className="mt-1 max-h-64 overflow-y-auto text-small leading-snug text-ink-muted whitespace-pre-wrap">
                {d.debugLogs.join('\n')}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};
