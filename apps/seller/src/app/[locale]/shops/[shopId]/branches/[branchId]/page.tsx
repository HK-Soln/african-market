import { setRequestLocale } from 'next-intl/server';
import { BranchEditor } from '@/components/branches/branch-editor';
import { RequireSession } from '@/components/require-session';
import { MapsProvider } from '@/lib/maps';

/** One branch: details, delivery, hours, special days. */
export default async function BranchPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string; branchId: string }>;
}) {
  const { locale, shopId, branchId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <MapsProvider>
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-2 pb-16">
          <BranchEditor shopId={shopId} branchId={branchId} />
        </main>
      </MapsProvider>
    </RequireSession>
  );
}
