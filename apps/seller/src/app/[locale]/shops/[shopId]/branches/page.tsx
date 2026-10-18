import { setRequestLocale } from 'next-intl/server';
import { BranchList } from '@/components/branches/branch-list';
import { RequireSession } from '@/components/require-session';

/** A shop's branches. */
export default async function BranchesPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
        <BranchList shopId={shopId} />
      </main>
    </RequireSession>
  );
}
