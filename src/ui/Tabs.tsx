import React from 'react';
import { cx } from './cx';

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

/** The main tab bar: Valve Pulp titles (its lowercase are small capitals), the open tab underlined in amber. */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <nav role="tablist" className={cx('flex items-center gap-1 overflow-x-auto no-scrollbar', className)}>
      {items.map((tab) => {
        const Icon = tab.icon;
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cx(
              'px-3 py-2 font-display text-body tracking-display border-b-2 flex items-center gap-1.5 whitespace-nowrap transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400',
              active ? 'border-accent-400 text-accent-300 bg-accent-500/10' : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
