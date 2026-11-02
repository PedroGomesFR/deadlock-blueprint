import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';

export interface ToastProps {
  message: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  closeLabel: string;
  /** Hides itself after this long (ms) */
  duration?: number;
}

/** A short notice at the bottom of the window, with an action (Undo). */
export const Toast: React.FC<ToastProps> = ({ message, actionLabel, onAction, onDismiss, closeLabel, duration = 6000 }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-surface-raised border border-bone/15 shadow-overlay text-body text-ink"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <Button size="sm" variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      <IconButton label={closeLabel} icon={<X className="w-3.5 h-3.5" />} onClick={onDismiss} />
    </div>
  );
};
