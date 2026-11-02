import React from 'react';
import { cx } from './cx';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'good'
  | 'bad'
  | 'info'
  | 'choice'
  | 'enhanced'
  | 'weapon'
  | 'vitality'
  | 'spirit';

// Written out in full so Tailwind finds every class
const SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-bone/5 border-bone/15 text-ink-soft',
  accent: 'bg-accent-950/60 border-accent-500/40 text-accent-300',
  good: 'bg-good-950/60 border-good-500/40 text-good-300',
  bad: 'bg-bad-950/60 border-bad-500/40 text-bad-300',
  info: 'bg-info-950/60 border-info-500/40 text-info-300',
  choice: 'bg-choice-950/60 border-choice-500/40 text-choice-300',
  enhanced: 'bg-enhanced-950/60 border-enhanced-500/40 text-enhanced-300',
  weapon: 'bg-weapon-950/60 border-weapon-500/40 text-weapon-300',
  vitality: 'bg-vitality-950/60 border-vitality-500/40 text-vitality-300',
  spirit: 'bg-spirit-950/60 border-spirit-500/40 text-spirit-300',
};

const SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-ink-soft border-transparent text-on-accent',
  accent: 'bg-accent-500 border-transparent text-on-accent',
  good: 'bg-good-300 border-transparent text-on-accent',
  bad: 'bg-bad-600 border-transparent text-ink-strong',
  info: 'bg-info-400 border-transparent text-on-accent',
  choice: 'bg-choice-400 border-transparent text-on-accent',
  enhanced: 'bg-enhanced-300 border-transparent text-on-accent',
  weapon: 'bg-weapon-500 border-transparent text-on-accent',
  vitality: 'bg-vitality-500 border-transparent text-on-accent',
  spirit: 'bg-spirit-500 border-transparent text-ink-strong',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  solid?: boolean;
  icon?: React.ReactNode;
}

/** A small label: status, count, category, "Affordable!", "dead"... */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', solid, icon, className, children, ...rest }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-small font-bold whitespace-nowrap',
      solid ? SOLID[tone] : SOFT[tone],
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </span>
);
