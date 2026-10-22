'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Modal, Skeleton } from '@am/ui';
import type { Result } from '@/lib/result';
import { useErrorText } from './error-text';

export interface DocumentViewerProps {
  title: string;
  /** Asked only when the viewer opens: every fetch is a recorded view. */
  load: () => Promise<Result<Blob>>;
  open: boolean;
  onClose: () => void;
}

/**
 * Shows a private document (an identity image or a trade licence) in a dialog. The bytes are
 * fetched with the admin's session and shown from memory; the object URL is dropped on close, so
 * nothing stays behind or can be shared.
 */
export function DocumentViewer({ title, load, open, onClose }: DocumentViewerProps) {
  const t = useTranslations('documents');
  const errorText = useErrorText();
  const [doc, setDoc] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest `load`, so the document is fetched once per opening, not once per render.
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!open) return;
    let live = true;
    let url: string | null = null;
    setDoc(null);
    setError(null);
    void loader.current().then((result) => {
      if (!live) return;
      if (!result.ok) return setError(result.code);
      url = URL.createObjectURL(result.data);
      setDoc({ url, type: result.data.type });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open]);

  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-danger">
          {errorText(error)}
        </p>
      ) : !doc ? (
        <Skeleton variant="block" height={320} aria-label={t('loading')} />
      ) : doc.type === 'application/pdf' ? (
        <div className="flex flex-col gap-3">
          <object data={doc.url} type="application/pdf" className="h-[60vh] w-full">
            <p className="text-ink-muted">{t('noPreview')}</p>
          </object>
          <a href={doc.url} download className="self-start font-semibold text-clay-ink">
            {t('download')}
          </a>
        </div>
      ) : (
        <img src={doc.url} alt={title} className="max-h-[60vh] w-full rounded-md object-contain" />
      )}
    </Modal>
  );
}
