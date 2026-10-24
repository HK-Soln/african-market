import { getTranslations } from 'next-intl/server';
import { Icon } from '@am/ui';
import { Link } from '@/i18n/navigation';
import type { PublicShop } from '@/lib/shop/server';

/**
 * Who sells (Federal Decree-Law 14 of 2023): the legal name and trade licence once an admin
 * checked them; until then, plainly that the licence is not checked yet.
 */
export async function SellerDetails({ shop }: { shop: PublicShop }) {
  const t = await getTranslations('shop');
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-4 text-sm">
      <h2 className="text-base font-semibold">{t('seller')}</h2>
      {shop.seller ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">{t('legalName')}</dt>
          <dd>{shop.seller.legalName}</dd>
          <dt className="text-ink-muted">{t('licence')}</dt>
          <dd>
            <bdi dir="ltr">{shop.seller.licenseNumber}</bdi>
          </dd>
          {shop.seller.issuingAuthority && (
            <>
              <dt className="text-ink-muted">{t('issuedBy')}</dt>
              <dd>{shop.seller.issuingAuthority}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-ink-muted">{t('sellerNotChecked')}</p>
      )}
    </section>
  );
}

/** Where people report a listing (the form is at /report). */
export async function ReportLink({
  query,
  label,
}: {
  query: Record<string, string>;
  label: string;
}) {
  return (
    <Link
      href={{ pathname: '/report', query }}
      className="inline-flex items-center gap-1 self-start text-sm text-ink-muted underline"
      rel="nofollow"
    >
      <Icon name="flag" size={16} />
      {label}
    </Link>
  );
}
