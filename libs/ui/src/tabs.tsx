'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: IconName;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selection. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** `segmented` is for two or three peer views such as List and Map. */
  variant?: 'underline' | 'segmented';
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}

/** Switches between views of the same object. Tab order follows the reading direction. */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  variant = 'underline',
  label,
  className,
}: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const selected = value ?? inner;
  const list = useRef<HTMLDivElement>(null);

  const pick = (id: string) => {
    setInner(id);
    onChange?.(id);
  };

  // Arrow keys move along the reading direction: "next" is left in RTL.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === selected);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    if (event.key === forward) next = (index + 1) % items.length;
    else if (event.key === backward) next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    pick(items[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={list}
      className={cx('am-tabs', `am-tabs-${variant}`, className)}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const on = item.id === selected;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cx('am-tab', on && 'am-tab-on')}
            onClick={() => pick(item.id)}
          >
            {item.icon && <Icon name={item.icon} size={18} />}
            <span>{item.label}</span>
            {item.count != null && <span className="am-tab-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
