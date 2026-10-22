'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Modal, Textarea } from '@am/ui';
import type { Result } from '@/lib/result';
import { useErrorText } from './error-text';

export interface DecisionDialogProps {
  /** A question: "Reject this shop?" */
  title: string;
  /** What happens, in a sentence. */
  body: string;
  /** The button that does it: "Reject". */
  confirm: string;
  /** Asks for a reason the seller will read. */
  reason?: boolean;
  danger?: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<Result<unknown>>;
}

/**
 * Confirms a decision, with the reason when one is needed. The seller reads the reason, so it is
 * required, and the dialog says so. Errors stay in the dialog; it closes on success.
 */
export function DecisionDialog({
  title,
  body,
  confirm,
  reason: withReason,
  danger,
  open,
  onClose,
  onConfirm,
}: DecisionDialogProps) {
  const t = useTranslations('decision');
  const errorText = useErrorText();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (withReason && !reason.trim()) return setError(t('reasonRequired'));
    setBusy(true);
    const result = await onConfirm(withReason ? reason.trim() : undefined);
    setBusy(false);
    if (result.ok) onClose();
    else setError(errorText(result.code));
  };

  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      tone={danger ? 'danger' : undefined}
      alert={danger}
      actions={
        <>
          <Button
            variant={danger ? 'destructive' : 'primary'}
            loading={busy}
            loadingLabel={t('saving')}
            onClick={() => void submit()}
          >
            {confirm}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">{body}</p>
        {withReason && (
          <Textarea
            label={t('reason')}
            hint={t('reasonHint')}
            value={reason}
            maxLength={1000}
            rows={4}
            onChange={(e) => setReason(e.target.value)}
            error={error ?? undefined}
          />
        )}
        {!withReason && error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
