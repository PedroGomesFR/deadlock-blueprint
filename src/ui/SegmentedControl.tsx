import React from 'react';
import { cx } from './cx';

export type SegmentTone = 'good' | 'accent' | 'bad' | 'weapon' | 'neutral';

// As the game's upgrade toggles: pill cells, the chosen one filled in mint with dark text.
const ACTIVE: Record<SegmentTone, string> = {
  good: 'bg-good-300 text-on-accent',
  accent: 'bg-accent-500 text-on-accent',
  bad: 'bg-bad-500 text-ink-strong',
  weapon: 'bg-weapon-500 text-on-accent',
  neutral: 'bg-ink-faint text-on-accent',
};

export interface SegmentOption<T> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Fill of this option when chosen (default: the control's tone) */
  tone?: SegmentTone;
  title?: string;
}

export interface SegmentedControlProps<T> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: SegmentTone;
  size?: 'sm' | 'md';
  /** Options share the full width */
  stretch?: boolean;
  label?: string;
  className?: string;
}

export function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
  tone = 'good',
  size = 'md',
  stretch,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('items-center gap-0.5 p-0.5 rounded-full bg-shade/50 border border-bone/10', stretch ? 'flex w-full' : 'inline-flex w-fit', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1 rounded-full font-label whitespace-nowrap transition',
              stretch && 'flex-1',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400',
              size === 'sm' ? 'px-2 py-0.5 text-small' : 'px-3 py-1 text-body',
              active ? ACTIVE[option.tone ?? tone] : 'text-ink-muted hover:text-ink-strong hover:bg-bone/5'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
