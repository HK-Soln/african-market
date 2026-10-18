'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Modal, Skeleton } from '@am/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { weekFromApi, weekProblem, weekToApi, type Week } from '@/lib/hours';
import { shopsApi, useSellerShop, type SellerBranch, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';
import { BranchForm } from '../setup/branch-form';
import { HoursEditor } from '../setup/hours-editor';
import { SpecialDays } from './special-days';

/**
 * One branch, or a new one: its details and delivery, its weekly hours, its special days, and
 * removing it. A new branch gets its hours once it exists.
 */
export function BranchEditor({ shopId, branchId }: { shopId: string; branchId?: string }) {
  const t = useTranslations('branches');
  const s = useTranslations('setup');
  const router = useRouter();
  const { state, reload } = useSellerShop(shopId);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton width="50%" height={32} />
        <Skeleton variant="block" height={300} />
      </div>
    );
  }
  if (state.status === 'error') return <EmptyState icon="building-store" title={s('notFound')} />;

  const shop = state.shop;
  const branch = branchId ? shop.branches.find((b) => b.id === branchId) : undefined;
  if (branchId && !branch) return <EmptyState icon="map-pin" title={t('notFound')} />;

  const back = (
    <Link
      href={`/shops/${shop.id}/branches`}
      className="self-start text-sm font-semibold text-clay-ink"
    >
      {t('allBranches')}
    </Link>
  );

  if (!branch) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="text-[26px] leading-8 font-bold">{t('newTitle')}</h1>
        <BranchForm
          shop={shop}
          onSaved={async () => {
            const result = await reload();
            const known = new Set(shop.branches.map((b) => b.id));
            const created = result.ok
              ? result.data.branches.find((b) => !known.has(b.id))
              : undefined;
            router.replace(
              created ? `/shops/${shop.id}/branches/${created.id}` : `/shops/${shop.id}/branches`,
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="text-[26px] leading-8 font-bold">{branch.name}</h1>
        <BranchForm key={branch.id} shop={shop} branch={branch} onSaved={() => void reload()} />
      </div>
      <BranchHours shop={shop} branch={branch} onSaved={reload} />
      <SpecialDays shopId={shop.id} branch={branch} onChange={reload} />
      <RemoveBranch shop={shop} branch={branch} />
    </div>
  );
}

function BranchHours({
  shop,
  branch,
  onSaved,
}: {
  shop: SellerShop;
  branch: SellerBranch;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations('branches');
  const h = useTranslations('hours');
  const s = useTranslations('setup');
  const errorText = useErrorText();
  const [week, setWeek] = useState<Week>(() => weekFromApi(branch.openingHours));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = weekProblem(week);
    if (problem) return setMessage({ error: true, text: h(`problem${problem.problem}`) });
    setSaving(true);
    const result = await shopsApi.setHours(shop.id, branch.id, weekToApi(week));
    setSaving(false);
    if (!result.ok) return setMessage({ error: true, text: errorText(result.code) });
    setMessage({ error: false, text: s('saved') });
    await onSaved();
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby="weekly-hours"
    >
      <h2 id="weekly-hours" className="text-lg font-semibold">
        {t('weeklyHours')}
      </h2>
      <HoursEditor week={week} onChange={setWeek} />
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'text-sm text-danger' : 'text-sm text-success'}
        >
          {message.text}
        </p>
      )}
      <Button type="submit" className="self-start" loading={saving} loadingLabel={s('saving')}>
        {t('saveHours')}
      </Button>
    </form>
  );
}

/** Removing a branch, after a question. A shop's only branch cannot go: a listing needs one. */
function RemoveBranch({ shop, branch }: { shop: SellerShop; branch: SellerBranch }) {
  const t = useTranslations('branches');
  const errorText = useErrorText();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const only = shop.branches.length === 1;

  const remove = async () => {
    setBusy(true);
    const result = await shopsApi.deleteBranch(shop.id, branch.id);
    setBusy(false);
    if (!result.ok) {
      setAsking(false);
      return setError(errorText(result.code));
    }
    router.replace(`/shops/${shop.id}/branches`);
  };

  return (
    <section
      className="flex flex-col gap-2 border-t border-line pt-6"
      aria-labelledby="remove-branch"
    >
      <h2 id="remove-branch" className="text-lg font-semibold">
        {t('remove')}
      </h2>
      <p className="text-sm text-ink-muted">{only ? t('removeOnly') : t('removeHint')}</p>
      {!only && (
        <Button variant="destructive" className="self-start" onClick={() => setAsking(true)}>
          {t('remove')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        alert
        tone="danger"
        icon="alert-triangle"
        title={t('removeQuestion', { name: branch.name })}
        actions={
          <>
            <Button
              variant="destructive"
              loading={busy}
              loadingLabel={t('removing')}
              onClick={remove}
            >
              {t('removeConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {t('keep')}
            </Button>
          </>
        }
      >
        {branch.isPrimary ? t('removePrimary') : t('removeBody')}
      </Modal>
    </section>
  );
}
