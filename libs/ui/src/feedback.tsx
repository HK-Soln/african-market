import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export type ToastTone = 'success' | 'danger' | 'info' | 'offline' | 'neutral';

const TOAST_ICON: Record<ToastTone, IconName> = {
  success: 'circle-check',
  danger: 'alert-triangle',
  info: 'info-circle',
  offline: 'wifi-off',
  neutral: 'info-circle',
};

export interface ToastProps {
  tone?: ToastTone;
  title: string;
  body?: string;
  /** A single action such as "Undo" or "Retry". */
  action?: string;
  onAction?: () => void;
  /** Shows a dismiss button. Requires `closeLabel`. */
  onClose?: () => void;
  closeLabel?: string;
  icon?: IconName;
  className?: string;
}

/** A brief message after an action. One at a time; danger and offline stay until dismissed. */
export function Toast({
  tone = 'neutral',
  title,
  body,
  action,
  onAction,
  onClose,
  closeLabel,
  icon,
  className,
}: ToastProps) {
  return (
    <div
      className={cx('am-toast', `am-toast-${tone}`, className)}
      role={tone === 'danger' || tone === 'offline' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <Icon name={icon ?? TOAST_ICON[tone]} />
      <div className="am-toast-text">
        <p className="am-toast-title">{title}</p>
        {body && <p className="am-toast-body">{body}</p>}
      </div>
      {action && (
        <button type="button" className="am-toast-action" onClick={onAction}>
          {action}
        </button>
      )}
      {onClose && (
        <button type="button" className="am-toast-x" aria-label={closeLabel} onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  /** Names the situation: "No shops within 5 km". */
  title: string;
  /** Gives a way forward, with real numbers when there are any. */
  body?: string;
  /** A primary Button that does it: "Search 15 km". */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: 'danger' | 'neutral';
  compact?: boolean;
  className?: string;
}

/** What to show when there is nothing: no results, location denied, offline, server error. */
export function EmptyState({
  icon = 'search',
  title,
  body,
  action,
  secondaryAction,
  tone,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx('am-empty', compact && 'am-empty-compact', className)}>
      <span className={cx('am-empty-icon', tone && `am-empty-icon-${tone}`)}>
        <Icon name={icon} size={28} />
      </span>
      <h3 className="am-empty-title">{title}</h3>
      {body && <p className="am-empty-body">{body}</p>}
      {(action || secondaryAction) && (
        <div className="am-empty-actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export interface SkeletonProps {
  variant?: 'text' | 'block' | 'circle' | 'pill' | 'shop-card';
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  className?: string;
}

/**
 * A placeholder shaped like the content it stands in for. Hidden from assistive technology;
 * mark the loading region `aria-busy="true"` instead.
 */
export function Skeleton({ variant = 'text', width, height, className }: SkeletonProps) {
  if (variant === 'shop-card') {
    return (
      <div className="am-card am-shop am-skel-card" aria-hidden>
        <div className="am-skel am-skel-block" style={{ aspectRatio: '16 / 9', borderRadius: 0 }} />
        <div className="am-shop-body">
          <div className="am-shop-head">
            <div className="am-skel am-skel-circle" style={{ width: 48, height: 48 }} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <div className="am-skel am-skel-text" style={{ width: '70%' }} />
              <div className="am-skel am-skel-text" style={{ width: '45%' }} />
            </div>
          </div>
          <div className="am-badges">
            <div className="am-skel am-skel-pill" />
            <div className="am-skel am-skel-pill" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cx('am-skel', `am-skel-${variant}`, className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** A raised surface with the standard border and radius. Cards at rest have no shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('am-card', className)} />;
}

export interface StepperProps {
  /** The name of each step, in order. */
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
  /** Accessible name of the stepper, e.g. "Shop setup". */
  label: string;
  /** "Step {n} of {total}" in the current language, with both placeholders. */
  stepLabel: string;
  /** Word appended to finished steps for screen readers, e.g. "done". */
  doneLabel: string;
  className?: string;
}

/** Progress through a short, fixed sequence such as seller onboarding. */
export function Stepper({ steps, current, label, stepLabel, doneLabel, className }: StepperProps) {
  return (
    <nav className={cx('am-stepper', className)} aria-label={label}>
      <div className="am-stepper-top">
        <span className="am-stepper-count">
          {stepLabel.replace('{n}', String(current + 1)).replace('{total}', String(steps.length))}
        </span>
        <span className="am-stepper-current">{steps[current]}</span>
      </div>
      <ol className="am-stepper-bar">
        {steps.map((step, index) => (
          <li
            key={step}
            className={cx(
              'am-stepper-seg',
              index < current && 'am-done',
              index === current && 'am-now',
            )}
            aria-current={index === current ? 'step' : undefined}
          >
            <span className="am-visually-hidden">
              {step}
              {index < current ? ` (${doneLabel})` : ''}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
