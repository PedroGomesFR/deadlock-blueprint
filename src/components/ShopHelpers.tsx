import React, { useEffect, useState } from 'react';
import { Check, Copy, Crosshair, HeartPulse, Sparkles } from 'lucide-react';
import type { ItemCategory, ItemTier } from '../data/deadlockData';
import { useI18n } from '../i18n';

/** Each shop tab's icon and text colour */
export const SHOP_TABS = {
  weapon: { Icon: Crosshair, className: 'text-orange-300' },
  vitality: { Icon: HeartPulse, className: 'text-emerald-300' },
  spirit: { Icon: Sparkles, className: 'text-purple-300' },
} as const;

const ROMAN: Record<ItemTier, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/**
 * Shop tab of an item at a glance: the tab's colour and icon, its name, and the tier. The full sentence
 * ("Shop: Vitality tab") stays in the tooltip for new players.
 */
export const ShopTabMarker: React.FC<{ category: ItemCategory; tier?: ItemTier }> = ({ category, tier }) => {
  const { t } = useI18n();
  const { Icon, className } = SHOP_TABS[category];
  const tab = t(`category.${category}`);
  return (
    <span className={`inline-flex items-center gap-1 text-small font-bold ${className}`} title={t('shop.tabTitle', tab)}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      <span>{tab}</span>
      {tier && <span className="text-slate-400 font-semibold">· {t('shop.tier', ROMAN[tier])}</span>}
    </span>
  );
};

/** Clipboard only: nothing is typed into the game (the app only reads the screen). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.electronAPI) return await window.electronAPI.copyText(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies an item's name, to paste it into the shop search. Never toggles the card it sits on. */
export const CopyNameButton: React.FC<{ name: string }> = ({ name }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(name)) setCopied(true);
      }}
      title={copied ? t('copy.done') : t('copy.title', name)}
      aria-label={t('copy.title', name)}
      className="p-1 -m-0.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 shrink-0 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};
