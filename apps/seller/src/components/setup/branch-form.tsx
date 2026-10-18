'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { EMIRATES } from '@am/geo';
import { Button, Checkbox, Input, Select } from '@am/ui';
import type { LatLng } from '@/lib/maps';
import { aedText, filsFromAed } from '@/lib/money';
import { shopsApi, type BranchBody, type SellerBranch, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';
import { LocationField } from './location-field';

/** Delivery distances on the slider, in kilometres. */
const RADIUS_MIN_KM = 1;
const RADIUS_MAX_KM = 50;
const RADIUS_DEFAULT_KM = 5;

/**
 * The first branch: its name and address, the pin on its door, and how it serves customers
 * (pickup, delivery within a radius, fee and minimum order). Creates it, then updates it.
 */
export function BranchForm({
  shop,
  branch,
  onSaved,
}: {
  shop: SellerShop;
  branch?: SellerBranch;
  onSaved: () => void;
}) {
  const t = useTranslations('setup');
  const e = useTranslations('emirates');
  const errorText = useErrorText();
  const [name, setName] = useState(branch?.name ?? '');
  const [emirate, setEmirate] = useState<BranchBody['emirate']>(branch?.emirate ?? 'DXB');
  const [area, setArea] = useState(branch?.area ?? '');
  const [addressLine, setAddressLine] = useState(branch?.addressLine ?? '');
  const [makani, setMakani] = useState(branch?.makani ?? '');
  const [location, setLocation] = useState<LatLng | null>(branch?.location ?? null);
  const [pickup, setPickup] = useState(branch?.pickup ?? true);
  const [delivery, setDelivery] = useState(branch?.delivery ?? false);
  const [radiusKm, setRadiusKm] = useState(
    branch?.serviceRadiusM ? Math.round(branch.serviceRadiusM / 1000) : RADIUS_DEFAULT_KM,
  );
  const [fee, setFee] = useState(aedText(branch?.deliveryFeeFils));
  const [minOrder, setMinOrder] = useState(aedText(branch?.minOrderFils));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makaniOk = makani.trim() === '' || /^\d{10}$/.test(makani.replace(/\s/g, ''));
  const feeFils = filsFromAed(fee);
  const minFils = filsFromAed(minOrder);
  const problems = {
    name: !name.trim() ? t('nameRequired') : undefined,
    makani: makaniOk ? undefined : t('makaniInvalid'),
    location: location ? undefined : t('pinRequired'),
    serve: pickup || delivery ? undefined : t('serveRequired'),
    fee: delivery && feeFils === null ? t('moneyInvalid') : undefined,
    minOrder: delivery && minFils === null ? t('moneyInvalid') : undefined,
  };
  const show = (problem?: string) => (tried ? problem : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean) || !location) return;
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      emirate,
      area: area.trim() || null,
      addressLine: addressLine.trim() || null,
      makani: makani.replace(/\s/g, '') || null,
      location,
      pickup,
      delivery,
      // A radius only for delivery; a drawn area comes with branch management (part 2).
      serviceRadiusM: delivery ? radiusKm * 1000 : null,
      deliveryFeeFils: delivery ? (feeFils ?? 0) : 0,
      minOrderFils: delivery ? (minFils ?? 0) : 0,
      isPrimary: true,
    };
    const result = branch
      ? await shopsApi.updateBranch(shop.id, branch.id, body)
      : await shopsApi.createBranch(shop.id, body);
    setSaving(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Input
        label={t('branchName')}
        hint={t('branchNameHint')}
        value={name}
        maxLength={120}
        onChange={(ev) => setName(ev.target.value)}
        error={show(problems.name)}
      />
      <Select
        label={t('emirate')}
        value={emirate}
        onChange={(ev) => setEmirate(ev.target.value as BranchBody['emirate'])}
        options={EMIRATES.map(({ code }) => ({ value: code, label: e(code) }))}
      />
      <Input
        label={t('area')}
        placeholder={t('areaPlaceholder')}
        optional={t('optional')}
        value={area}
        maxLength={120}
        onChange={(ev) => setArea(ev.target.value)}
      />
      <Input
        label={t('addressLine')}
        placeholder={t('addressPlaceholder')}
        optional={t('optional')}
        value={addressLine}
        maxLength={300}
        onChange={(ev) => setAddressLine(ev.target.value)}
        autoComplete="street-address"
      />
      <Input
        label={t('makani')}
        hint={t('makaniHint')}
        optional={t('optional')}
        inputMode="numeric"
        dir="ltr"
        value={makani}
        maxLength={13}
        onChange={(ev) => setMakani(ev.target.value)}
        error={show(problems.makani)}
      />

      <LocationField
        value={location}
        onChange={setLocation}
        emirate={emirate}
        radiusM={delivery ? radiusKm * 1000 : null}
        error={show(problems.location)}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">{t('howServe')}</legend>
        <Checkbox
          label={t('pickup')}
          checked={pickup}
          onChange={(ev) => setPickup(ev.target.checked)}
        />
        <Checkbox
          label={t('delivery')}
          checked={delivery}
          onChange={(ev) => setDelivery(ev.target.checked)}
        />
        {show(problems.serve) && (
          <p role="alert" className="text-sm text-danger">
            {problems.serve}
          </p>
        )}
      </fieldset>

      {delivery && (
        <fieldset className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="radius" className="font-semibold">
              {t('radius', { km: radiusKm })}
            </label>
            <input
              id="radius"
              type="range"
              min={RADIUS_MIN_KM}
              max={RADIUS_MAX_KM}
              step={1}
              value={radiusKm}
              onChange={(ev) => setRadiusKm(Number(ev.target.value))}
              className="accent-clay"
              aria-describedby="radius-hint"
            />
            <p id="radius-hint" className="text-sm text-ink-muted">
              {t('radiusHint')}
            </p>
          </div>
          <Input
            label={t('deliveryFee')}
            hint={t('moneyHint')}
            inputMode="decimal"
            dir="ltr"
            value={fee}
            onChange={(ev) => setFee(ev.target.value)}
            error={show(problems.fee)}
          />
          <Input
            label={t('minOrder')}
            hint={t('moneyHint')}
            inputMode="decimal"
            dir="ltr"
            value={minOrder}
            onChange={(ev) => setMinOrder(ev.target.value)}
            error={show(problems.minOrder)}
          />
        </fieldset>
      )}

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
