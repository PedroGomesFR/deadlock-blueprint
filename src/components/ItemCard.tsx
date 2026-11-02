import React from 'react';
import { DeadlockItem } from '../data/deadlockData';
import { Check, Zap } from 'lucide-react';
import { ItemArtworkIcon } from './DeadlockIcons';
import { ShopTabMarker } from './ShopHelpers';
import { useI18n } from '../i18n';
import { Badge, cx } from '../ui';

interface ItemCardProps {
  item: DeadlockItem;
  isOwned: boolean;
  onToggleOwned: (id: string) => void;
  compact?: boolean;
  highlightReasons?: string[];
  urgencyBadge?: string;
}

// Each shop tab tints its cards, as the game's shop tiles
const CATEGORY_STYLES = {
  weapon: {
    border: 'border-weapon-500/40 hover:border-weapon-400',
    bg: 'from-weapon-950/45 via-surface-panel to-surface-panel',
  },
  vitality: {
    border: 'border-vitality-500/40 hover:border-vitality-400',
    bg: 'from-vitality-950/45 via-surface-panel to-surface-panel',
  },
  spirit: {
    border: 'border-spirit-500/40 hover:border-spirit-400',
    bg: 'from-spirit-950/45 via-surface-panel to-surface-panel',
  },
} as const;

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400';

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  isOwned,
  onToggleOwned,
  compact = false,
  highlightReasons,
}) => {
  const { t } = useI18n();
  const categoryStyles = CATEGORY_STYLES[item.category];

  // Short name in the interface language (the French data adds the English name in brackets, shown on hover)
  const primaryName = item.name.split('(')[0].trim();
  const tooltip = [`${item.name} • ${t('souls', String(item.cost))}`, item.hint, item.stats.join(' | ')]
    .filter(Boolean)
    .join('\n');

  // Ultra-Clean Visual Tile (Used on Main Page & Overlay)
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={isOwned}
        onClick={() => onToggleOwned(item.id)}
        title={tooltip}
        className={cx(
          'w-full text-left p-2 rounded-xl border transition-all flex items-center justify-between gap-2.5',
          FOCUS,
          isOwned
            ? 'bg-shade/40 border-bone/15 opacity-60'
            : `bg-gradient-to-r ${categoryStyles.bg} ${categoryStyles.border} hover:scale-[1.01]`
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <ItemArtworkIcon itemId={item.id} category={item.category} size={44} />
            {isOwned && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-good-500 text-on-accent flex items-center justify-center">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cx('font-label text-body truncate', isOwned ? 'line-through text-ink-muted' : 'text-ink-strong')}>
                {primaryName}
              </span>
              {item.isActive && (
                <Badge tone="accent" className="shrink-0 uppercase">
                  {t('item.active')}
                </Badge>
              )}
            </div>
            {highlightReasons && highlightReasons.length > 0 ? (
              <p className="text-small text-accent-300 font-medium truncate">⚡ {highlightReasons[0]}</p>
            ) : (
              <ShopTabMarker category={item.category} tier={item.tier} />
            )}
          </div>
        </div>
        <div className="text-right shrink-0 pl-1">
          <span className="text-body font-extrabold text-info-300 tabular-nums">{item.cost}</span>
          <span className="text-small text-info-500 block leading-none">{t('souls.unit')}</span>
        </div>
      </button>
    );
  }

  // Detailed Card (Only used in secondary "Item details" tab). A button for the keyboard and screen readers too.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isOwned}
      onClick={() => onToggleOwned(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleOwned(item.id);
        }
      }}
      title={item.stats.join('\n') || undefined}
      className={cx(
        'group relative cursor-pointer rounded-xl border p-3 transition-all duration-200 bg-gradient-to-br',
        FOCUS,
        isOwned
          ? 'from-shade/40 to-surface-panel border-bone/15 opacity-65'
          : `${categoryStyles.bg} ${categoryStyles.border} hover:shadow-raised`
      )}
    >
      <div className="flex items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ItemArtworkIcon itemId={item.id} category={item.category} size={48} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className={cx('font-label text-title truncate', isOwned ? 'line-through text-ink-muted' : 'text-ink-strong')}>
                {primaryName}
              </h4>
              {item.isActive && (
                <Badge tone="accent" className="shrink-0 uppercase" icon={<Zap className="w-2.5 h-2.5" />}>
                  {t('item.active')}
                </Badge>
              )}
            </div>
            <ShopTabMarker category={item.category} tier={item.tier} />
          </div>
        </div>

        <Badge tone="info" className="text-body tabular-nums shrink-0">
          {item.cost}
        </Badge>
      </div>

      <p className="text-body text-ink mb-1.5 leading-snug">{item.hint}</p>
      {item.stats.length > 0 && <p className="text-small text-ink-muted mb-1.5 leading-snug">{item.stats.join(' • ')}</p>}

      {highlightReasons && highlightReasons.length > 0 && (
        <div className="text-small text-accent-300 font-medium">⚡ {highlightReasons[0]}</div>
      )}
    </div>
  );
};
