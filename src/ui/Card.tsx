import React from 'react';
import { cx } from './cx';

export type CardTone = 'panel' | 'raised' | 'well';

const TONE: Record<CardTone, string> = {
  panel: 'bg-surface-panel border-bone/10',
  raised: 'bg-surface-raised border-bone/10',
  well: 'bg-shade/40 border-bone/10',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Larger radius, for the sections of a screen */
  section?: boolean;
}

/** A bordered surface. Colours of a highlighted card (border-accent-500/60...) come in through className. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ tone = 'panel', section, className, ...rest }, ref) => (
  <div ref={ref} className={cx('border', section ? 'rounded-2xl' : 'rounded-xl', TONE[tone], className)} {...rest} />
));
Card.displayName = 'Card';
