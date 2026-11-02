import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';

export interface ModalShellProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Closes on the backdrop, the close button and Escape; without it the dialog must be answered (onboarding). */
  onClose?: () => void;
  closeLabel?: string;
  size?: 'md' | 'lg';
  /** 'top' sits above the other dialogs (onboarding) */
  layer?: 'modal' | 'top';
  /** Replaces the title row (a logo next to the title...) */
  header?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A centred dialog over a dimmed, blurred backdrop. */
export const ModalShell: React.FC<ModalShellProps> = ({
  title,
  icon,
  onClose,
  closeLabel,
  size = 'lg',
  layer = 'modal',
  header,
  className,
  children,
}) => {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={cx(
        'fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4',
        layer === 'top' ? 'z-[60] bg-shade/80' : 'z-50 bg-shade/70'
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'w-full max-h-full overflow-y-auto rounded-2xl bg-surface-raised border border-bone/15 shadow-overlay p-4 space-y-3',
          size === 'md' ? 'max-w-md' : 'max-w-lg',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {header ?? (
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-heading tracking-display text-ink-strong flex items-center gap-2">
              {icon}
              {title}
            </h2>
            {onClose && <IconButton label={closeLabel ?? ''} icon={<X className="w-4 h-4" />} onClick={onClose} />}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
