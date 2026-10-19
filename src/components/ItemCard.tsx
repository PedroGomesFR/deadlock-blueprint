import React from 'react';
import { DeadlockItem } from '../data/deadlockData';
import { Check, Zap } from 'lucide-react';
import { ItemArtworkIcon } from './DeadlockIcons';
import { useI18n } from '../i18n';

interface ItemCardProps {
  item: DeadlockItem;
  isOwned: boolean;
  onToggleOwned: (id: string) => void;
  compact?: boolean;
  highlightReasons?: string[];
  urgencyBadge?: string;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  isOwned,
  onToggleOwned,
  compact = false,
  highlightReasons,
}) => {
  const { t } = useI18n();
  const categoryStyles = {
    weapon: {
      border: 'border-orange-500/40 hover:border-orange-400',
      bg: 'from-orange-950/45 via-deadlock-panel to-deadlock-panel',
      badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      label: t('category.weapon'),
    },
    vitality: {
      border: 'border-emerald-500/40 hover:border-emerald-400',
      bg: 'from-emerald-950/45 via-deadlock-panel to-deadlock-panel',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      label: t('category.vitality'),
    },
    spirit: {
      border: 'border-purple-500/40 hover:border-purple-400',
      bg: 'from-purple-950/45 via-deadlock-panel to-deadlock-panel',
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      label: t('category.spirit'),
    },
  }[item.category];

  // Short name in the interface language (the French data adds the English name in brackets, shown on hover)
  const primaryName = item.name.split('(')[0].trim();
  const tooltip = [`${item.name} • ${t('souls', String(item.cost))}`, item.hint, item.stats.join(' | ')]
    .filter(Boolean)
    .join('\n');

  // Ultra-Clean Visual Tile (Used on Main Page & Overlay)
  if (compact) {
    return (
      <button
        onClick={() => onToggleOwned(item.id)}
        title={tooltip}
        className={`w-full text-left p-2 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
          isOwned
            ? 'bg-emerald-950/40 border-emerald-500/70 opacity-60'
            : `bg-gradient-to-r ${categoryStyles.bg} ${categoryStyles.border} hover:scale-[1.01]`
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <ItemArtworkIcon itemId={item.id} category={item.category} size={38} />
            {isOwned && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-bold truncate ${
                  isOwned ? 'line-through text-slate-400' : 'text-white'
                }`}
              >
                {primaryName}
              </span>
              {item.isActive && (
                <span className="px-1 py-0.2 text-[9px] font-extrabold uppercase bg-amber-500/25 text-amber-300 rounded border border-amber-500/40 shrink-0">
                  {t('item.active')}
                </span>
              )}
            </div>
            {highlightReasons && highlightReasons.length > 0 ? (
              <p className="text-[10px] text-emerald-300 font-medium truncate">
                ⚡ {highlightReasons[0]}
              </p>
            ) : (
              <span className={`text-[10px] px-1.5 py-0.2 rounded border inline-block mt-0.5 ${categoryStyles.badge}`}>
                T{item.tier} • {categoryStyles.label}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 pl-1">
          <span className="text-xs font-extrabold text-teal-300">{item.cost}</span>
          <span className="text-[9px] text-teal-500 block leading-none">{t('souls.unit')}</span>
        </div>
      </button>
    );
  }

  // Detailed Card (Only used in secondary "Item details" tab)
  return (
    <div
      onClick={() => onToggleOwned(item.id)}
      title={item.stats.join('\n') || undefined}
      className={`group relative cursor-pointer rounded-xl border p-3 transition-all duration-200 bg-gradient-to-br ${
        isOwned
          ? 'from-emerald-950/40 to-deadlock-panel border-emerald-500/60 opacity-65'
          : `${categoryStyles.bg} ${categoryStyles.border} hover:shadow-lg`
      }`}
    >
      <div className="flex items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ItemArtworkIcon itemId={item.id} category={item.category} size={42} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4
                className={`font-bold text-sm truncate ${
                  isOwned ? 'line-through text-emerald-300' : 'text-white'
                }`}
              >
                {primaryName}
              </h4>
              {item.isActive && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-500/25 text-amber-300 rounded border border-amber-500/50 flex items-center gap-0.5 shrink-0">
                  <Zap className="w-2.5 h-2.5" /> {t('item.active')}
                </span>
              )}
            </div>
            <span className={`text-[10px] px-1.5 py-0.2 rounded border inline-block mt-0.5 ${categoryStyles.badge}`}>
              T{item.tier} • {categoryStyles.label}
            </span>
          </div>
        </div>

        <div className="px-2 py-1 rounded-lg bg-teal-950/80 border border-teal-500/40 text-teal-300 font-bold text-xs shrink-0">
          {item.cost}
        </div>
      </div>

      <p className="text-xs text-amber-200/95 mb-1.5 leading-snug">{item.hint}</p>
      {item.stats.length > 0 && (
        <p className="text-[10px] text-slate-400 mb-1.5 leading-snug">{item.stats.join(' • ')}</p>
      )}

      {highlightReasons && highlightReasons.length > 0 && (
        <div className="text-[11px] text-emerald-300 font-medium">
          ⚡ {highlightReasons[0]}
        </div>
      )}
    </div>
  );
};
