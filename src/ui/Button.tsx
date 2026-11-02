import React from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'spirit' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

// The game's buttons: dark pills with a thin light ring inside and cream Valve Occult labels ("Quick Buy",
// "Build Browser"); the destructive one is a red slanted tag ("EXIT GAME").
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded-full bg-accent-500 hover:bg-accent-400 text-on-accent border-2 border-shade/70 shadow-pill',
  secondary: 'rounded-full bg-surface-base hover:bg-surface-raised text-ink-strong border-2 border-shade/70 shadow-pill',
  success: 'rounded-full bg-good-300 hover:bg-good-200 text-on-accent border-2 border-shade/70 shadow-pill',
  spirit: 'rounded-full bg-spirit-500 hover:bg-spirit-400 text-ink-strong border-2 border-shade/70 shadow-pill',
  danger: 'rounded-none bg-bad-800 hover:bg-bad-700 text-bone [clip-path:polygon(0_0,100%_0,94%_100%,3%_100%)]',
  ghost: 'rounded-full text-ink-muted hover:text-ink-strong hover:bg-bone/5',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-0.5 text-small gap-1',
  md: 'px-3 py-1 text-body gap-1.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon (or any element) before the label */
  icon?: React.ReactNode;
  /** On/off button (Auto scan, Overlay): when on, it takes `pressedVariant` and says so to screen readers */
  pressed?: boolean;
  pressedVariant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, pressed, pressedVariant = 'success', className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cx(
        'inline-flex items-center justify-center font-label whitespace-nowrap transition',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
        VARIANT[pressed ? pressedVariant : variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Tooltip and accessible name */
  label: string;
  icon: React.ReactNode;
}

/** A round icon-only button (close, dismiss, copy). */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex items-center justify-center p-1 rounded-full text-ink-muted hover:text-ink-strong hover:bg-bone/10 transition',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400',
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  )
);
IconButton.displayName = 'IconButton';
