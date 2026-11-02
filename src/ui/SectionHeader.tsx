import React from 'react';
import { cx } from './cx';

export interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Right side: a hint, a count, an action */
  aside?: React.ReactNode;
  /** h2 for the sections of a screen, h3 inside a dialog or card */
  as?: 'h2' | 'h3';
  className?: string;
}

/**
 * A section title in Valve Pulp, bone like the game's poster capitals (every title has this one colour), with an
 * optional amber icon and a right-hand side.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, aside, as: Tag = 'h3', className }) => (
  <div className={cx('flex items-center justify-between gap-3', className)}>
    <Tag className="font-display text-body tracking-display text-ink-strong flex items-center gap-1.5 min-w-0">
      {icon && <span className="text-accent-400 shrink-0 flex">{icon}</span>}
      {title}
    </Tag>
    {aside}
  </div>
);
