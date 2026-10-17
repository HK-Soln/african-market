'use client';

import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import { Badge, ContactButtons, ShopCard } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { recordContact } from '@/lib/contact';
import { formatDistance } from '@/lib/search/params';
import type { NearbyBranch } from '@/lib/search/server';
import { useSearchData } from './search-data';

/** One branch in the results: who, how far, open or not, where from, and how to reach them. */
export function ResultCard({
  item,
  showDistance = true,
}: {
  item: NearbyBranch;
  showDistance?: boolean;
}) {
  const t = useTranslations('search');
  const locale = useLocale() as Locale;
  const { categoryName, countryName } = useSearchData();

  const category = item.categoryIds.map(categoryName).find(Boolean);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const origins = item.originCountries.slice(0, 3);
  const products = item.matchedProducts.map((p) => pickLocalized(p.title, locale)).filter(Boolean);

  const meta = [
    showDistance ? (
      <bdi key="d" dir="ltr">
        {formatDistance(item.distanceM, locale)}
      </bdi>
    ) : null,
    item.area ?? item.branchName,
    category,
  ].filter(Boolean);

  return (
    <ShopCard
      name={item.shopName}
      href={`/s/${item.shopSlug}`}
      linkAs={Link}
      logoUrl={item.logoUrl}
      meta={meta}
      badges={
        <>
          {item.verified && <Badge tone="verified">{t('verified')}</Badge>}
          <Badge tone={item.openNow ? 'open' : 'closed'}>
            {item.openNow ? t('open') : t('closed')}
          </Badge>
          {item.delivery && <Badge tone="delivers">{t('delivers')}</Badge>}
        </>
      }
      origins={origins}
      originLabel={
        origins.length
          ? t('fromCountries', { countries: list.format(origins.map(countryName)) })
          : undefined
      }
      actions={
        <div className="flex flex-col gap-2">
          {products.length > 0 && (
            <p className="text-sm text-ink-muted">
              {t('has', { products: list.format(products) })}
            </p>
          )}
          <ContactButtons
            whatsapp={item.contactWhatsapp ?? undefined}
            phone={item.contactPhone ?? undefined}
            labels={{ whatsapp: t('whatsapp'), call: t('call'), email: t('email') }}
            onContact={(channel) => {
              if (channel === 'chat') return;
              recordContact({ shopId: item.shopId, branchId: item.branchId, channel });
            }}
          />
        </div>
      }
    />
  );
}
