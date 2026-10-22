import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuditLog } from '@/components/audit-log';
import { RequireAdmin } from '@/components/require-admin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'audit' });
  return { title: t('title') };
}

/** Who did what in the console, newest first. */
export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      {/* The shop filter is read from the address, which is only known in the browser. */}
      <Suspense>
        <AuditLog />
      </Suspense>
    </RequireAdmin>
  );
}
