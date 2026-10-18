'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Skeleton, type CountryOption } from '@am/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { weekFromApi, weekProblem, weekToApi, type Week } from '@/lib/hours';
import {
  firstBranch,
  nextStep,
  SETUP_STEPS,
  shopsApi,
  useSellerShop,
  type SellerShop,
  type SetupStep,
} from '@/lib/shops';
import { useErrorText } from '../error-text';
import { BranchForm } from './branch-form';
import { ContactsForm } from './contacts-form';
import { DetailsForm, type CategoryOption } from './details-form';
import { VerificationPanel } from '../verify/verification-panel';
import { HoursEditor } from './hours-editor';
import { PhotosForm } from './photos-form';
import { SetupFrame } from './setup-frame';

/**
 * Onboarding for one shop, a step at a time. The step is in the address (`?step=`); without one,
 * the first step not done yet, so a seller who left half way comes back to the right place.
 */
export function ShopSetup({
  shopId,
  step: requested,
  categories,
  origins,
  phoneCountries,
}: {
  shopId: string;
  step?: string;
  categories: CategoryOption[];
  origins: CountryOption[];
  phoneCountries: CountryOption[];
}) {
  const t = useTranslations('setup');
  const router = useRouter();
  const { state, reload, setShop } = useSellerShop(shopId);

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6" aria-busy>
        <Skeleton variant="pill" width={200} />
        <Skeleton width="60%" height={32} />
        <Skeleton variant="block" height={240} />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState icon="building-store" title={t('notFound')} />
      </main>
    );
  }

  const shop = state.shop;
  const step: SetupStep = SETUP_STEPS.includes(requested as SetupStep)
    ? (requested as SetupStep)
    : (nextStep(shop) ?? 'contacts');
  const index = SETUP_STEPS.indexOf(step);
  const go = (to: SetupStep) =>
    router.replace({ pathname: `/shops/${shop.id}/setup`, query: { step: to } });
  const next = async () => {
    await reload();
    const following = SETUP_STEPS[index + 1];
    if (following) go(following);
    else router.push(`/shops/${shop.id}`);
  };
  const back =
    index > 0 ? (
      <Link
        href={{ pathname: `/shops/${shop.id}/setup`, query: { step: SETUP_STEPS[index - 1] } }}
        className="self-start text-sm font-semibold text-clay-ink"
      >
        {t('back')}
      </Link>
    ) : null;

  if (step === 'details') {
    return (
      <SetupFrame step="details" title={t('detailsTitle')} intro={t('detailsIntro')}>
        <DetailsForm
          shop={shop}
          categories={categories}
          countries={origins}
          onSaved={(saved) => {
            setShop(saved);
            go('branch');
          }}
        />
      </SetupFrame>
    );
  }

  const branch = firstBranch(shop);
  if (step === 'branch' || !branch) {
    return (
      <SetupFrame step="branch" title={t('branchTitle')} intro={t('branchIntro')}>
        {back}
        <BranchForm shop={shop} branch={branch} onSaved={next} />
      </SetupFrame>
    );
  }

  if (step === 'hours') {
    return (
      <SetupFrame step="hours" title={t('hoursTitle')} intro={t('hoursIntro')}>
        {back}
        <HoursStep shop={shop} onSaved={next} />
      </SetupFrame>
    );
  }

  if (step === 'contacts') {
    return (
      <SetupFrame step="contacts" title={t('contactsTitle')} intro={t('contactsIntro')}>
        {back}
        <ContactsForm shop={shop} countries={phoneCountries} onSaved={next} />
      </SetupFrame>
    );
  }

  if (step === 'photos') {
    return (
      <SetupFrame step="photos" title={t('photosTitle')} intro={t('photosIntro')}>
        {back}
        <PhotosForm shop={shop} onChange={setShop} onDone={() => go('verify')} />
      </SetupFrame>
    );
  }

  return (
    <SetupFrame step="verify" title={t('verifyTitle')} intro={t('verifyIntro')}>
      {back}
      <VerificationPanel shop={shop} onChange={setShop} />
    </SetupFrame>
  );
}

/** The first branch's weekly hours: edited here, saved together. */
function HoursStep({ shop, onSaved }: { shop: SellerShop; onSaved: () => void }) {
  const t = useTranslations('setup');
  const h = useTranslations('hours');
  const errorText = useErrorText();
  const branch = firstBranch(shop)!;
  const [week, setWeek] = useState<Week>(() =>
    branch.openingHours.length
      ? weekFromApi(branch.openingHours)
      : // A usual week to start from: every day 9 to 9.
        weekFromApi(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            opensAt: '09:00',
            closesAt: '21:00',
          })),
        ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = weekProblem(week);
    if (problem) {
      setError(h(`problem${problem.problem}`));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await shopsApi.setHours(shop.id, branch.id, weekToApi(week));
    setSaving(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <HoursEditor week={week} onChange={setWeek} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={saving}
        loadingLabel={t('saving')}
        className="self-start"
      >
        {t('save')}
      </Button>
    </form>
  );
}
