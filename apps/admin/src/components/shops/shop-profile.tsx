'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { components } from '@am/api-client';
import { pickLocalized, textDirection, type Locale } from '@am/i18n';
import { Badge } from '@am/ui';
import { browserApi } from '@/lib/browser-api';
import type { AdminShop } from '@/lib/review';
import { run } from '@/lib/result';
import { Facts, Section } from './verification-sections';

type Category = components['schemas']['CategoryDto'];

/**
 * What customers would see: photos, description in each language, categories, origins and
 * contacts. The reviewer checks it is a real shop that may be listed.
 */
export function ProfileSection({ shop }: { shop: AdminShop }) {
  const t = useTranslations('review.profile');
  const locale = useLocale() as Locale;
  const [categories, setCategories] = useState<Map<string, Category>>(new Map());

  useEffect(() => {
    void run(
      browserApi.GET('/api/v1/admin/categories', { params: { query: { includeInactive: true } } }),
    ).then((result) => {
      if (result.ok) setCategories(new Map(result.data.items.map((c) => [c.id, c])));
    });
  }, []);

  const src = (id: string) => shop.imageUrls?.[id]?.card ?? shop.imageUrls?.[id]?.thumb;
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const logo = shop.logoMediaId ? src(shop.logoMediaId) : undefined;
  const gallery = shop.galleryMediaIds.flatMap((id) => {
    const url = src(id);
    return url ? [{ id, url }] : [];
  });

  return (
    <Section id="review-profile" title={t('title')}>
      <div className="flex flex-wrap gap-2">
        {logo ? (
          <img
            src={logo}
            alt={t('logo')}
            className="size-20 rounded-md border border-line object-cover"
          />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-muted">
            {t('noLogo')}
          </span>
        )}
        {gallery.map((g, i) => (
          <img
            key={g.id}
            src={g.url}
            alt={t('photoN', { n: i + 1 })}
            className="size-20 rounded-md border border-line object-cover"
          />
        ))}
      </div>
      {shop.galleryMediaIds.length > gallery.length && (
        <p className="text-sm text-ink-muted">
          {t('processing', { n: shop.galleryMediaIds.length - gallery.length })}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {(['en', 'ar', 'fr'] as const).map((lang) => (
          <div key={lang} className="flex flex-col gap-1">
            <h3 className="text-sm text-ink-muted">{t(`description.${lang}`)}</h3>
            {shop.description[lang] ? (
              <p lang={lang} dir={textDirection(lang)} className="whitespace-pre-line text-start">
                {shop.description[lang]}
              </p>
            ) : (
              <p className="text-ink-muted">—</p>
            )}
          </div>
        ))}
      </div>

      <Facts
        rows={[
          [
            t('categories'),
            shop.categoryIds.length
              ? shop.categoryIds
                  .map((id) => {
                    const c = categories.get(id);
                    return c ? pickLocalized(c.name, locale) : id;
                  })
                  .join(', ')
              : null,
          ],
          [
            t('origins'),
            shop.originCountries.length
              ? shop.originCountries.map((code) => regions.of(code) ?? code).join(', ')
              : null,
          ],
          [t('whatsapp'), shop.contactWhatsapp && <span dir="ltr">{shop.contactWhatsapp}</span>],
          [t('phone'), shop.contactPhone && <span dir="ltr">{shop.contactPhone}</span>],
          [t('email'), shop.contactEmail && <span dir="ltr">{shop.contactEmail}</span>],
          [
            t('slug'),
            <span key="slug" dir="ltr">
              {shop.slug}
            </span>,
          ],
        ]}
      />
    </Section>
  );
}

/** Where the shop is and how it serves customers, branch by branch. */
export function BranchesSection({ shop }: { shop: AdminShop }) {
  const t = useTranslations('review.branches');
  const emirates = useTranslations('emirates');

  return (
    <Section id="review-branches" title={t('title', { n: shop.branches.length })}>
      {shop.branches.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shop.branches.map((b) => (
            <li key={b.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{b.name}</span>
                {b.isPrimary && <Badge tone="brand">{t('primary')}</Badge>}
              </span>
              <span className="text-sm text-ink-muted">
                {[b.addressLine, b.area, emirates(b.emirate)].filter(Boolean).join(', ')}
              </span>
              <span className="flex flex-wrap gap-2">
                {b.pickup && <Badge tone="neutral">{t('pickup')}</Badge>}
                {b.delivery && <Badge tone="delivers">{t('delivery')}</Badge>}
                {b.openingHours.length === 0 && <Badge tone="warning">{t('noHours')}</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
