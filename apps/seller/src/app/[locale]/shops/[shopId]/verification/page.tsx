import { setRequestLocale } from 'next-intl/server';
import { RequireSession } from '@/components/require-session';
import { ShopVerification } from '@/components/verify/shop-verification';

/**
 * Getting listed. The identity provider sends the owner back here after the check (the shops
 * service's callback), so the page asks for the result on arrival.
 */
export default async function VerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; shopId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  return (
    <RequireSession>
      <ShopVerification shopId={shopId} returning={Object.keys(query).length > 0} />
    </RequireSession>
  );
}
