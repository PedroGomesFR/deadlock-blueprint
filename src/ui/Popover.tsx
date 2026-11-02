import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';

export type PopoverTone = 'accent' | 'good' | 'bad';

const BORDER: Record<PopoverTone, string> = {
  accent: 'border-accent-500/60',
  good: 'border-good-500/60',
  bad: 'border-bad-500/60',
};

export interface PopoverPanelProps {
  title: React.ReactNode;
  tone?: PopoverTone;
  onClose: () => void;
  closeLabel: string;
  /** Actions next to the close button */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A picker that drops under the header bar (hero, ally, enemies). Closes with its button or Escape. */
export const PopoverPanel: React.FC<PopoverPanelProps> = ({ title, tone = 'accent', onClose, closeLabel, actions, className, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      className={cx(
        'fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-surface-raised border shadow-overlay z-50 space-y-2',
        BORDER[tone],
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-bone/10 pb-1.5">
        <h2 className="font-display text-body tracking-display text-ink-strong">{title}</h2>
        <div className="flex items-center gap-2">
          {actions}
          <IconButton label={closeLabel} icon={<X className="w-4 h-4" />} onClick={onClose} />
        </div>
      </div>
      {children}
    </div>
  );
};

export interface PickTileProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Colours of the chosen state, e.g. 'bg-accent-500/25 border-accent-400 text-ink-strong' */
  selectedClassName?: string;
  selected?: boolean;
}

/** One choice in a picker grid: a portrait and a name. */
export const PickTile: React.FC<PickTileProps> = ({ selected, selectedClassName, className, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-pressed={selected}
    className={cx(
      'p-1.5 rounded-xl border text-left flex items-center gap-1.5 transition',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400',
      selected ? cx('font-bold', selectedClassName) : 'bg-shade/40 border-bone/5 text-ink-soft hover:bg-bone/5 hover:border-bone/15',
      className
    )}
    {...rest}
  />
);
