'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MEDIA_RULES } from '@am/contracts';
import { Badge, Button, Card, Icon, Input, type BadgeTone } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { shopsApi, type SellerShop, type VerificationOverview } from '@/lib/shops';
import { useErrorText } from '../error-text';
import { STATUS_TONE } from '../shops/my-shops';

const KYC_TONE: Record<string, BadgeTone> = {
  none: 'neutral',
  pending: 'pending',
  passed: 'verified',
  failed: 'rejected',
};

/** What the server says is missing before the shop can be sent, with the step that fixes it. */
const MISSING_STEP: Record<string, string> = { branch: 'branch', contact: 'contacts' };

/**
 * Getting listed: where the listing stands (with the admin's reason when it came back), the
 * owner's identity check at the provider, the trade licence (optional now; needed for checkout
 * later), and sending the shop for review. Also where the identity provider sends the owner back.
 */
export function VerificationPanel({
  shop,
  returning,
  onChange,
}: {
  shop: SellerShop;
  /** Just back from the identity provider: ask it where things stand. */
  returning?: boolean;
  onChange: (shop: SellerShop) => void;
}) {
  const t = useTranslations('verify');
  const shops = useTranslations('shops');
  const locale = useLocale() as 'en' | 'ar' | 'fr';
  const errorText = useErrorText();
  const [overview, setOverview] = useState<VerificationOverview | null>(null);
  const [busy, setBusy] = useState<'kyc' | 'refresh' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const asked = useRef(false);

  const apply = (next: VerificationOverview) => {
    setOverview(next);
    onChange({ ...shop, ...next.shop, imageUrls: shop.imageUrls });
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void (async () => {
      const result =
        returning && shop.kycStatus !== 'passed'
          ? await shopsApi.refreshKyc(shop.id)
          : await shopsApi.verification(shop.id);
      if (result.ok) apply(result.data);
      else setError(errorText(result.code));
    })();
    // Once, on arrival.
  }, []);

  const current = overview?.shop ?? shop;
  const reason = current.verificationReason;
  const kycRequest = overview?.requests.find((r) => r.type === 'kyc');
  const licence = overview?.requests.find((r) => r.type === 'trade_license');
  const canSubmit = ['draft', 'rejected'].includes(current.verificationStatus);

  const startKyc = async () => {
    setBusy('kyc');
    setError(null);
    const result = await shopsApi.startKyc(shop.id, locale);
    if (result.ok) {
      window.location.assign(result.data.url);
      return;
    }
    setBusy(null);
    setError(errorText(result.code));
  };

  const refresh = async () => {
    setBusy('refresh');
    const result = await shopsApi.refreshKyc(shop.id);
    setBusy(null);
    if (result.ok) apply(result.data);
    else setError(errorText(result.code));
  };

  const submit = async () => {
    setBusy('submit');
    setError(null);
    setMissing([]);
    const result = await shopsApi.submit(shop.id);
    setBusy(null);
    if (result.ok) {
      apply(result.data);
      return;
    }
    const list = (result.details?.missing as string[] | undefined) ?? [];
    setMissing(list);
    setError(errorText(result.code));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('listing')}</h2>
          <Badge tone={STATUS_TONE[current.verificationStatus] ?? 'neutral'}>
            {shops(`status${current.verificationStatus}`)}
          </Badge>
        </div>
        <p className="text-sm text-ink-muted">{t(`listing${current.verificationStatus}`)}</p>
        {reason && ['rejected', 'suspended'].includes(current.verificationStatus) && (
          <p className="rounded-md bg-warning-soft p-3 text-sm">
            <span className="font-semibold">{t('reason')}</span> {reason}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('identity')}</h2>
          <Badge tone={KYC_TONE[current.kycStatus] ?? 'neutral'}>
            {t(`kyc${current.kycStatus}`)}
          </Badge>
        </div>
        <p className="text-sm text-ink-muted">{t(`kycHelp${current.kycStatus}`)}</p>
        {kycRequest?.status === 'rejected' && kycRequest.reason && (
          <p className="text-sm">
            <span className="font-semibold">{t('reason')}</span> {kycRequest.reason}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(current.kycStatus === 'none' || current.kycStatus === 'failed') && (
            <Button
              variant="primary"
              iconStart="id"
              loading={busy === 'kyc'}
              loadingLabel={t('opening')}
              onClick={startKyc}
            >
              {current.kycStatus === 'failed' ? t('kycAgain') : t('kycStart')}
            </Button>
          )}
          {current.kycStatus === 'pending' && (
            <Button
              iconStart="refresh"
              loading={busy === 'refresh'}
              loadingLabel={t('checking')}
              onClick={refresh}
            >
              {t('kycCheck')}
            </Button>
          )}
        </div>
      </Card>

      <TradeLicence
        shopId={shop.id}
        status={licence?.status}
        reason={licence?.reason}
        onSaved={apply}
      />

      {canSubmit && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold">{t('send')}</h2>
          <p className="text-sm text-ink-muted">{t('sendHelp')}</p>
          {missing.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {missing.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <Icon name="alert-triangle" size={16} className="text-warning" />
                  {t(`missing${m}`)}
                  {MISSING_STEP[m] && (
                    <Link
                      href={{
                        pathname: `/shops/${shop.id}/setup`,
                        query: { step: MISSING_STEP[m] },
                      }}
                      className="font-semibold text-clay-ink"
                    >
                      {t('fix')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button
            // The identity check is the one main action until it has started.
            variant={['none', 'failed'].includes(current.kycStatus) ? 'secondary' : 'primary'}
            className="self-start"
            loading={busy === 'submit'}
            loadingLabel={t('sending')}
            onClick={submit}
          >
            {current.verificationStatus === 'rejected' ? t('sendAgain') : t('sendButton')}
          </Button>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The trade licence: legal name, number, issuer, expiry and a copy. Optional now; once an admin
 * checks it, the shop page names the seller (decision T-40), and checkout needs it later.
 */
function TradeLicence({
  shopId,
  status,
  reason,
  onSaved,
}: {
  shopId: string;
  status?: string;
  reason?: string | null;
  onSaved: (overview: VerificationOverview) => void;
}) {
  const t = useTranslations('verify');
  const s = useTranslations('setup');
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    legalName: '',
    licenseNumber: '',
    issuingAuthority: '',
    expiry: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule = MEDIA_RULES.trade_license;
  const fileProblem = !file
    ? t('licenceFileRequired')
    : !rule.contentTypes.includes(file.type)
      ? t('licenceFileType')
      : file.size > rule.maxBytes
        ? t('licenceFileSize', { mb: Math.round(rule.maxBytes / 1024 / 1024) })
        : null;
  const today = new Date().toISOString().slice(0, 10);
  const problems = {
    legalName: !form.legalName.trim() ? t('required') : undefined,
    licenseNumber: !form.licenseNumber.trim() ? t('required') : undefined,
    issuingAuthority: !form.issuingAuthority.trim() ? t('required') : undefined,
    expiry: !form.expiry ? t('required') : form.expiry <= today ? t('expired') : undefined,
    file: fileProblem ?? undefined,
  };
  const show = (p?: string) => (tried ? p : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean) || !file) return;
    setSaving(true);
    setError(null);
    const uploaded = await shopsApi.upload(shopId, file, 'trade_license');
    if (!uploaded.ok) {
      setSaving(false);
      setError(errorText(uploaded.code));
      return;
    }
    const result = await shopsApi.submitTradeLicense(shopId, {
      legalName: form.legalName.trim(),
      licenseNumber: form.licenseNumber.trim(),
      issuingAuthority: form.issuingAuthority.trim(),
      expiry: form.expiry,
      documentMediaId: uploaded.data,
    });
    setSaving(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    setOpen(false);
    onSaved(result.data);
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t('licence')} <span className="text-sm font-normal text-ink-muted">{s('optional')}</span>
        </h2>
        {status && (
          <Badge
            tone={
              status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : 'pending'
            }
          >
            {t(`licence${status}`)}
          </Badge>
        )}
      </div>
      <p className="text-sm text-ink-muted">{t('licenceHelp')}</p>
      {status === 'rejected' && reason && (
        <p className="text-sm">
          <span className="font-semibold">{t('reason')}</span> {reason}
        </p>
      )}
      {!open ? (
        <Button className="self-start" iconStart="upload" onClick={() => setOpen(true)}>
          {status ? t('licenceReplace') : t('licenceAdd')}
        </Button>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Input
            label={t('legalName')}
            value={form.legalName}
            maxLength={200}
            onChange={(ev) => setForm({ ...form, legalName: ev.target.value })}
            error={show(problems.legalName)}
          />
          <Input
            label={t('licenseNumber')}
            dir="ltr"
            value={form.licenseNumber}
            maxLength={60}
            onChange={(ev) => setForm({ ...form, licenseNumber: ev.target.value })}
            error={show(problems.licenseNumber)}
          />
          <Input
            label={t('issuingAuthority')}
            placeholder={t('issuingAuthorityPlaceholder')}
            value={form.issuingAuthority}
            maxLength={120}
            onChange={(ev) => setForm({ ...form, issuingAuthority: ev.target.value })}
            error={show(problems.issuingAuthority)}
          />
          <Input
            label={t('expiry')}
            type="date"
            dir="ltr"
            min={today}
            value={form.expiry}
            onChange={(ev) => setForm({ ...form, expiry: ev.target.value })}
            error={show(problems.expiry)}
          />
          <div className="flex flex-col gap-1">
            <label className="am-field-label" htmlFor="licence-file">
              {t('licenceFile')}
            </label>
            <input
              id="licence-file"
              type="file"
              accept={rule.contentTypes.join(',')}
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <p className="text-xs text-ink-muted">{t('licenceFileHint')}</p>
            {show(problems.file) && (
              <p role="alert" className="text-sm text-danger">
                {problems.file}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={saving} loadingLabel={s('saving')}>
              {t('licenceSend')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
