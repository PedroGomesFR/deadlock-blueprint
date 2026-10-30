import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { ItemCategory } from '../data/deadlockData';
import { useI18n } from '../i18n';
import {
  CHEAP_TOP_UP,
  CategoryInvestment,
  InvestmentProgress,
  KEY_SPIKE,
  SpikeBadge,
  paceStatus,
} from '../services/investments';
import { SHOP_TABS } from './ShopHelpers';

/** The bars in the shop tab colours */
const BAR_COLOR: Record<ItemCategory, string> = {
  weapon: 'bg-orange-400',
  vitality: 'bg-emerald-400',
  spirit: 'bg-purple-400',
};

/**
 * The badge under an item that takes its category to 4,800 (spikeBadge): "Reaches the 4,800 Spirit spike", or "Last 800
 * souls to ..." when the category is already close. Neutral chip with the tab colour on the icon: amber is kept for "late".
 */
export const SpikeChip: React.FC<{ badge: SpikeBadge; compact?: boolean }> = ({ badge, compact = false }) => {
  const { t, formatNumber } = useI18n();
  const category = t(`category.${badge.category}`);
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border font-bold bg-white/5 border-white/20 text-slate-100 ${
        compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
      } text-small`}
      title={t('invest.spikeTitle')}
    >
      <TrendingUp className={`w-3 h-3 shrink-0 ${SHOP_TABS[badge.category].className}`} aria-hidden />
      <span>
        {badge.topUp === null
          ? t('invest.spike', category, formatNumber(KEY_SPIKE))
          : t('invest.topUp', category, formatNumber(KEY_SPIKE), formatNumber(badge.topUp))}
      </span>
    </div>
  );
};

/** "Spike 1: players usually have it by 10–12 min", amber once the player is behind, quiet once the spike is past. */
const PaceLine: React.FC<{ investment: InvestmentProgress; clockS?: number; compact: boolean }> = ({
  investment,
  clockS,
  compact,
}) => {
  const { t, formatNumber } = useI18n();
  const { spikeNumber, pace } = investment;
  if (!pace) return null;
  const range = `${Math.round(pace.highRank)}–${Math.round(pace.lowRank)}`;
  const slowerMinute = String(Math.round(pace.lowRank));
  switch (paceStatus(investment, clockS)) {
    case 'past':
      return <span className="text-slate-400">{t(compact ? 'invest.offShort' : 'invest.off', spikeNumber)}</span>;
    case 'topUp':
      return <span className="text-slate-400">{t(compact ? 'invest.coreDoneShort' : 'invest.coreDone', formatNumber(CHEAP_TOP_UP))}</span>;
    case 'behind':
      return (
        <span className="font-bold text-amber-300">
          {t(compact ? 'invest.behindShort' : 'invest.behind', spikeNumber, slowerMinute)}
        </span>
      );
    case 'onPace':
      return <span className="text-slate-400">{t(compact ? 'invest.paceShort' : 'invest.pace', spikeNumber, range)}</span>;
  }
};

/** One category: its name, souls out of 4,800 (✓ when done) and a bar. The one to finish next has a ring. */
const CategoryBar: React.FC<{ category: CategoryInvestment; isTarget: boolean; number?: number }> = ({
  category,
  isTarget,
  number,
}) => {
  const { t, formatNumber } = useI18n();
  const { Icon, className } = SHOP_TABS[category.category];
  return (
    <div className={`flex-1 min-w-0 space-y-1 ${isTarget || category.done ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-1 text-small">
        <span className={`flex items-center gap-1 font-bold ${className}`}>
          {number !== undefined && <span className="text-slate-500">{number}</span>}
          <Icon className="w-3 h-3 shrink-0" aria-hidden />
          {t(`category.${category.category}`)}
        </span>
        <span className={`tabular-nums ${category.done ? 'font-bold text-slate-200' : 'text-slate-300'}`}>
          {category.done
            ? `✓ ${formatNumber(category.souls)}`
            : `${formatNumber(category.souls)} / ${formatNumber(KEY_SPIKE)}`}
        </span>
      </div>
      <div className={`h-1.5 rounded-full bg-white/10 overflow-hidden ${isTarget ? 'ring-1 ring-white/30' : ''}`}>
        <div
          className={`h-full rounded-full ${BAR_COLOR[category.category]}`}
          style={{ width: `${Math.min(100, (category.souls / KEY_SPIKE) * 100)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * The three 4,800 spikes in the build's order: souls in each category, the one to finish next and when players usually
 * have that many (rank 81+ to rank 1-40). Compact (overlay): the next one only, with a short pace line.
 */
export const InvestmentLine: React.FC<{ investment: InvestmentProgress; clockS?: number; compact?: boolean }> = ({
  investment,
  clockS,
  compact = false,
}) => {
  const { t, formatNumber } = useI18n();
  const { categories, target } = investment;
  if (!target) {
    return (
      <p className="text-small text-slate-400" title={t('invest.title')}>
        {t('invest.allDone', formatNumber(KEY_SPIKE))}
      </p>
    );
  }
  if (compact) {
    return (
      <div className="space-y-1" title={t('invest.title')}>
        <CategoryBar category={target} isTarget />
        <p className="text-small truncate">
          <PaceLine investment={investment} clockS={clockS} compact />
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" title={t('invest.title')}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap text-small">
        <span className="font-bold text-slate-200">{t('invest.label', formatNumber(KEY_SPIKE))}</span>
        <PaceLine investment={investment} clockS={clockS} compact={false} />
      </div>
      <div className="flex gap-3">
        {categories.map((category, index) => (
          <CategoryBar key={category.category} category={category} isTarget={category === target} number={index + 1} />
        ))}
      </div>
    </div>
  );
};
