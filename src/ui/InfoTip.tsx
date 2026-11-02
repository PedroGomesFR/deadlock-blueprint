import React from 'react';
import { Info } from 'lucide-react';
import { cx } from './cx';

/** Help text on demand: an ⓘ that shows it on hover (and to screen readers), instead of a paragraph always on screen. */
export const InfoTip: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span
    tabIndex={0}
    role="img"
    title={text}
    aria-label={text}
    className={cx(
      'inline-flex shrink-0 text-ink-faint hover:text-ink-soft cursor-help rounded-full',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400',
      className
    )}
  >
    <Info className="w-3.5 h-3.5" />
  </span>
);
