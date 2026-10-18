'use client';

import { useTranslations } from 'next-intl';
import type { CountryOption } from '@am/ui';
import { useRouter } from '@/i18n/navigation';
import { DetailsForm, type CategoryOption } from './details-form';
import { SetupFrame } from './setup-frame';

/** Creates the shop, then carries on with its location. */
export function NewShop({
  categories,
  origins,
}: {
  categories: CategoryOption[];
  origins: CountryOption[];
}) {
  const t = useTranslations('setup');
  const router = useRouter();
  return (
    <SetupFrame step="details" title={t('detailsTitle')} intro={t('detailsIntro')}>
      <DetailsForm
        categories={categories}
        countries={origins}
        onSaved={(shop) =>
          router.replace({ pathname: `/shops/${shop.id}/setup`, query: { step: 'branch' } })
        }
      />
    </SetupFrame>
  );
}
