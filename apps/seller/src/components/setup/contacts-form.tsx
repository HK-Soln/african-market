'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@am/i18n';
import {
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  countryName,
  formatPhoneAsTyped,
  Input,
  matchesCountry,
  PhoneInput,
  UAE,
  type CountryOption,
} from '@am/ui';
import { checkPhone, checkWhatsapp, splitPhone, type PhoneCheck } from '@/lib/phone';
import { shopsApi, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A phone field's state: the number as typed and its country. */
interface PhoneState {
  national: string;
  country: CountryOption;
}

/**
 * How customers reach the shop: a WhatsApp number (must be a mobile), a number for calls (may be
 * the same) and an email. At least one is needed; numbers may be from abroad.
 */
export function ContactsForm({
  shop,
  countries,
  onSaved,
}: {
  shop: SellerShop;
  countries: CountryOption[];
  onSaved: () => void;
}) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const options = countries.length ? countries : [UAE];
  const initial = (e164: string | null): PhoneState => {
    const split = splitPhone(e164);
    return {
      national: split?.national ?? '',
      country: options.find((c) => c.code === split?.country) ?? UAE,
    };
  };
  const [whatsapp, setWhatsapp] = useState(() => initial(shop.contactWhatsapp));
  const [phone, setPhone] = useState(() => initial(shop.contactPhone));
  const [same, setSame] = useState(
    Boolean(shop.contactWhatsapp && shop.contactWhatsapp === shop.contactPhone) ||
      !shop.contactPhone,
  );
  const [email, setEmail] = useState(shop.contactEmail ?? '');
  const [picking, setPicking] = useState<'whatsapp' | 'phone' | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wa = checkWhatsapp(whatsapp.national, whatsapp.country.code);
  const call = same ? wa : checkPhone(phone.national, phone.country.code);
  const emailOk = !email.trim() || EMAIL.test(email.trim());
  const reason = (check: PhoneCheck) =>
    check.ok || check.reason === 'empty'
      ? undefined
      : check.reason === 'not-mobile'
        ? t('notMobile')
        : t('phoneInvalid');
  const nothing = !wa.ok && !call.ok && !email.trim();
  const problems = {
    whatsapp: reason(wa),
    phone: same ? undefined : reason(call),
    email: emailOk ? undefined : t('emailInvalid'),
    nothing: nothing ? t('contactRequired') : undefined,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setSaving(true);
    setError(null);
    const result = await shopsApi.update(shop.id, {
      contactWhatsapp: wa.ok ? wa.e164 : null,
      contactPhone: call.ok ? call.e164 : null,
      contactEmail: email.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    onSaved();
  };

  const show = (problem?: string) => (tried ? problem : undefined);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PhoneInput
        label={t('whatsapp')}
        hint={t('whatsappHint')}
        country={whatsapp.country}
        locale={locale}
        countryLabel={t('countryCode')}
        onCountryClick={() => setPicking('whatsapp')}
        value={whatsapp.national}
        onChange={(ev) =>
          setWhatsapp({
            ...whatsapp,
            national: formatPhoneAsTyped(whatsapp.country, ev.target.value),
          })
        }
        error={show(problems.whatsapp)}
      />
      <Checkbox
        label={t('sameAsWhatsapp')}
        checked={same}
        onChange={(ev) => setSame(ev.target.checked)}
      />
      {!same && (
        <PhoneInput
          label={t('phone')}
          country={phone.country}
          locale={locale}
          countryLabel={t('countryCode')}
          onCountryClick={() => setPicking('phone')}
          value={phone.national}
          onChange={(ev) =>
            setPhone({ ...phone, national: formatPhoneAsTyped(phone.country, ev.target.value) })
          }
          error={show(problems.phone)}
        />
      )}
      <Input
        label={t('email')}
        optional={t('optional')}
        type="email"
        dir="ltr"
        autoComplete="email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        error={show(problems.email)}
      />

      {show(problems.nothing) && (
        <p role="alert" className="text-sm text-danger">
          {problems.nothing}
        </p>
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

      <CountrySheet
        open={picking !== null}
        countries={options}
        onClose={() => setPicking(null)}
        onPick={(country) => {
          if (picking === 'whatsapp') setWhatsapp({ national: '', country });
          if (picking === 'phone') setPhone({ national: '', country });
          setPicking(null);
        }}
      />
    </form>
  );
}

/** Choose a phone number's country: a searchable list with flags and dial codes. */
function CountrySheet({
  open,
  countries,
  onClose,
  onPick,
}: {
  open: boolean;
  countries: CountryOption[];
  onClose: () => void;
  onPick: (country: CountryOption) => void;
}) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => (query.trim() ? countries.filter((c) => matchesCountry(c, query)) : countries),
    [countries, query],
  );
  return (
    <BottomSheet title={t('chooseCountry')} open={open} onClose={onClose} closeLabel={t('back')}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('originSearch')}
          type="search"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          {shown.map((c) => (
            <Chip key={c.code} flag={c.code} onClick={() => onPick(c)}>
              {countryName(c, locale)} <bdi dir="ltr">{c.dialCode}</bdi>
            </Chip>
          ))}
        </div>
        {shown.length === 0 && <p className="text-sm text-ink-muted">{t('noCountries')}</p>}
      </div>
    </BottomSheet>
  );
}
