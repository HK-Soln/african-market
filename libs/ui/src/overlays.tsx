'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './button';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour shared by the sheet and the modal: focus moves in on open and back to the
 * trigger on close, Tab stays inside, and Escape closes.
 */
function useDialog(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return event.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      trigger?.focus?.();
    };
  }, [open]);

  return ref;
}

export interface BottomSheetProps {
  title: string;
  open?: boolean;
  onClose?: () => void;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** For example a "Clear" ghost button. */
  headerAction?: ReactNode;
  /** Usually one primary full-width button. It does not scroll with the body. */
  footer?: ReactNode;
  /** Positions the sheet inside its parent instead of the viewport, for previews. */
  contained?: boolean;
  children?: ReactNode;
}

/** The phone pattern for filters, location choice, opening hours and pickers. */
export function BottomSheet({
  title,
  open = true,
  onClose,
  closeLabel,
  headerAction,
  footer,
  contained,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className={cx('am-overlay', 'am-overlay-sheet', contained && 'am-contained')}>
      <div className="am-scrim" onClick={onClose} />
      <section
        ref={ref}
        className="am-sheet"
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="am-sheet-grab" aria-hidden />
        <header className="am-sheet-head">
          <h2 id={titleId} className="am-sheet-title">
            {title}
          </h2>
          {headerAction}
          <IconButton icon="x" label={closeLabel} onClick={onClose} />
        </header>
        <div className="am-sheet-body">{children}</div>
        {footer && <footer className="am-sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}

export interface ModalProps {
  /** For a decision, phrase it as a question; the buttons name the outcomes. */
  title: string;
  open?: boolean;
  onClose?: () => void;
  icon?: IconName;
  tone?: 'danger';
  /** Uses `role="alertdialog"` for destructive or blocking choices. */
  alert?: boolean;
  /** Buttons, primary first. */
  actions?: ReactNode;
  contained?: boolean;
  children?: ReactNode;
}

/** A centred dialog for confirmations and short decisions. Never open one on page load. */
export function Modal({
  title,
  open = true,
  onClose,
  icon,
  tone,
  alert,
  actions,
  contained,
  children,
}: ModalProps) {
  const titleId = useId();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className={cx('am-overlay', 'am-overlay-modal', contained && 'am-contained')}>
      <div className="am-scrim" onClick={onClose} />
      <section
        ref={ref}
        className="am-modal"
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {icon && (
          <span className={cx('am-modal-icon', tone && `am-modal-icon-${tone}`)}>
            <Icon name={icon} size={24} />
          </span>
        )}
        <h2 id={titleId} className="am-modal-title">
          {title}
        </h2>
        {children && <div className="am-modal-body">{children}</div>}
        {actions && <div className="am-modal-actions">{actions}</div>}
      </section>
    </div>
  );
}
