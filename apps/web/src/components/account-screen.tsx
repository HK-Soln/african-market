'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, Checkbox, Modal, Toast, Toggle } from '@am/ui';
import { UAE_TIMEZONE } from '@am/i18n';
import { useSession } from '@/components/session-provider';
import { useRouter } from '@/i18n/navigation';
import { auth } from '@/lib/browser-api';

/** Saves a JSON value as a file in the browser's downloads. */
function saveJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The signed-in person's own data (UAE PDPL): download a copy, change marketing consent, delete
 * the account. Deleting needs a sign-in from the last 10 minutes; an older one is sent to sign
 * in again and comes back here.
 */
export function AccountScreen() {
  const t = useTranslations('accountPage');
  const locale = useLocale();
  const router = useRouter();
  const session = useSession();

  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<'reauth' | 'failed' | null>(null);
  const [erasedAfter, setErasedAfter] = useState<string | null>(null);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: UAE_TIMEZONE }).format(
      new Date(iso),
    );

  // Shown after deletion, when the session is already gone.
  if (erasedAfter) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <h2 className="text-[20px] leading-7 font-semibold">{t('deletedTitle')}</h2>
        <p>{t('deletedBody', { date: formatDate(erasedAfter) })}</p>
      </Card>
    );
  }

  if (session.status === 'loading') return <p className="text-ink-muted">{t('checking')}</p>;

  if (session.status === 'signed-out') {
    return (
      <Card className="flex flex-col items-start gap-3 p-5">
        <p>{t('signInFirst')}</p>
        <Button
          variant="primary"
          onClick={() => router.push({ pathname: '/sign-in', query: { next: '/account' } })}
        >
          {t('signIn')}
        </Button>
      </Card>
    );
  }

  const download = async () => {
    setDownloading(true);
    setDownloadFailed(false);
    const result = await auth.exportData();
    setDownloading(false);
    if (!result.ok) {
      setDownloadFailed(true);
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    saveJson(result.data, `african-market-data-${day}.json`);
  };

  const setMarketing = async (on: boolean) => {
    setSavingConsent(true);
    const result = await auth.updateProfile({ marketingConsent: on });
    setSavingConsent(false);
    if (result.ok) session.setUser(result.data.user);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const result = await auth.deleteAccount();
    setDeleting(false);
    setConfirming(false);
    setUnderstood(false);
    if (result.ok) {
      setErasedAfter(result.data.erasedAfter);
      // The gateway already cleared the cookies; this forgets the session in this tab.
      await session.signOut();
      return;
    }
    setProblem(result.code === 'AUTH_REAUTH_REQUIRED' ? 'reauth' : 'failed');
  };

  const signInAgain = async () => {
    await session.signOut();
    router.push({ pathname: '/sign-in', query: { next: '/account' } });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-start gap-3 p-5">
        <h2 className="text-[20px] leading-7 font-semibold">{t('dataTitle')}</h2>
        <p className="text-ink-muted">{t('dataBody')}</p>
        <Button
          onClick={() => void download()}
          loading={downloading}
          loadingLabel={t('downloading')}
        >
          {t('download')}
        </Button>
        {downloadFailed && <p className="text-danger">{t('downloadFailed')}</p>}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-[20px] leading-7 font-semibold">{t('marketingTitle')}</h2>
        <Toggle
          label={t('marketingLabel')}
          description={t('marketingDescription')}
          checked={session.user?.marketingConsent ?? false}
          disabled={savingConsent}
          onChange={(event) => void setMarketing(event.target.checked)}
        />
      </Card>

      <Card className="flex flex-col items-start gap-3 p-5">
        <h2 className="text-[20px] leading-7 font-semibold">{t('deleteTitle')}</h2>
        <p className="text-ink-muted">{t('deleteBody')}</p>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          {t('deleteButton')}
        </Button>
      </Card>

      {problem === 'reauth' && (
        <Toast
          tone="info"
          title={t('reauthTitle')}
          body={t('reauthBody')}
          action={t('reauthAction')}
          onAction={() => void signInAgain()}
          onClose={() => setProblem(null)}
          closeLabel={t('close')}
        />
      )}
      {problem === 'failed' && (
        <Toast
          tone="danger"
          title={t('deleteFailed')}
          onClose={() => setProblem(null)}
          closeLabel={t('close')}
        />
      )}

      <Modal
        open={confirming}
        alert
        tone="danger"
        icon="alert-triangle"
        title={t('confirmTitle')}
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button
              variant="destructive"
              fullWidth
              disabled={!understood}
              loading={deleting}
              loadingLabel={t('deleting')}
              onClick={() => void deleteAccount()}
            >
              {t('confirmDelete')}
            </Button>
            <Button fullWidth onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        <p>{t('confirmBody')}</p>
        <Checkbox
          label={t('confirmCheck')}
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
      </Modal>
    </div>
  );
}
