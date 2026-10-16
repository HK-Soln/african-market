'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@am/i18n';
import { Button, IconButton } from '../button';
import { Checkbox } from '../choice';
import { CountryFlag } from '../country-flag';
import { countryName, formatPhoneAsTyped, matchesCountry, type CountryOption } from '../countries';
import { Input, Select } from '../field';
import { Icon, type IconName } from '../icon';
import { Logo } from '../logo';
import { OtpInput } from '../otp-input';
import { BottomSheet } from '../overlays';
import { PhoneInput } from '../phone-input';
import { formatCountdown, type AuthLabels } from './auth-helpers';

/** Each language is written in its own script, so these are not translated. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', ar: 'العربية', fr: 'Français' };

interface ShellProps {
  /** The control at the start of the top row: close on the first screen, back after it. */
  lead: { icon: IconName; label: string; onClick: () => void };
  /** For example "Not now" on the first screen. */
  trailing?: ReactNode;
  children: ReactNode;
  /** The screen's one primary action, pinned under the content. */
  footer?: ReactNode;
  onSubmit?: () => void;
}

/** The frame every sign-in screen shares: a top row, the content, and the action at the bottom. */
function Shell({ lead, trailing, children, footer, onSubmit }: ShellProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[430px] flex-col px-5 pt-2 pb-6"
    >
      <div className="flex items-center justify-between">
        <IconButton icon={lead.icon} label={lead.label} onClick={lead.onClick} />
        {trailing}
      </div>
      <div className="flex grow flex-col gap-6 pt-4 pb-6">{children}</div>
      {footer}
    </form>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[26px] leading-[1.3] font-bold">{title}</h1>
      {children && <p className="text-[15px] leading-[1.6] text-ink-muted">{children}</p>}
    </div>
  );
}

/** A problem with the whole form, as opposed to one field. Announced when it appears. */
function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="am-field-msg am-field-msg-error" role="alert">
      <Icon name="alert-triangle" size={16} />
      {message}
    </p>
  );
}

/** A phone number, code or address: always left-to-right, even inside Arabic. */
const Ltr = ({ children }: { children: ReactNode }) => (
  <bdi dir="ltr" className="font-bold text-ink">
    {children}
  </bdi>
);

interface PasswordFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  labels: Pick<AuthLabels, 'showPassword' | 'hidePassword'>;
}

function PasswordField({ label, hint, value, onChange, autoComplete, labels }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      label={label}
      hint={hint}
      type={visible ? 'text' : 'password'}
      dir="ltr"
      value={value}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      maxLength={128}
      onChange={(event) => onChange(event.target.value)}
      suffix={
        <button
          type="button"
          className="text-sm font-semibold text-clay"
          aria-pressed={visible}
          onClick={() => setVisible((on) => !on)}
        >
          {visible ? labels.hidePassword : labels.showPassword}
        </button>
      }
    />
  );
}

// ---- Phone

export interface PhoneStepProps {
  labels: AuthLabels;
  locale: Locale;
  /** The countries a new account may use, in display order. */
  countries: CountryOption[];
  country: CountryOption;
  onCountryChange: (country: CountryOption) => void;
  number: string;
  onNumberChange: (number: string) => void;
  onSubmit: () => void;
  onEmail: () => void;
  onClose: () => void;
  termsHref: string;
  privacyHref: string;
  busy?: boolean;
  error?: string | null;
}

/** The first screen: a mobile number, with the code sent on WhatsApp. */
export function PhoneStep({
  labels,
  locale,
  countries,
  country,
  onCountryChange,
  number,
  onNumberChange,
  onSubmit,
  onEmail,
  onClose,
  termsHref,
  privacyHref,
  busy,
  error,
}: PhoneStepProps) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const found = countries.filter((option) => matchesCountry(option, search));
  const openPicker = () => {
    setSearch('');
    setPicking(true);
  };
  return (
    <Shell
      lead={{ icon: 'x', label: labels.close, onClick: onClose }}
      trailing={
        <Button variant="ghost" size="sm" onClick={onClose}>
          {labels.notNow}
        </Button>
      }
      onSubmit={onSubmit}
      footer={
        <p className="text-center text-[13px] leading-[1.6] text-ink-muted">
          {labels.termsLead}{' '}
          <a className="text-clay underline" href={termsHref}>
            {labels.terms}
          </a>{' '}
          {labels.and}{' '}
          <a className="text-clay underline" href={privacyHref}>
            {labels.privacy}
          </a>
          .
        </p>
      }
    >
      <Logo variant="mark" size={48} />
      <Heading title={labels.phoneTitle}>{labels.phoneWhy}</Heading>
      <PhoneInput
        label={labels.phoneLabel}
        hint={labels.phoneHint}
        error={error ?? undefined}
        countryLabel={labels.countryLabel}
        country={country}
        locale={locale}
        onCountryClick={openPicker}
        value={number}
        onChange={(event) => onNumberChange(formatPhoneAsTyped(country, event.target.value))}
        maxLength={24}
        autoFocus
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        iconStart="brand-whatsapp"
        loading={busy}
        loadingLabel={labels.sending}
      >
        {labels.sendCode}
      </Button>
      <div aria-hidden className="flex items-center gap-3 text-[13px] text-ink-muted">
        <span className="h-px grow bg-line" />
        {labels.or}
        <span className="h-px grow bg-line" />
      </div>
      <Button fullWidth iconStart="mail" onClick={onEmail}>
        {labels.continueWithEmail}
      </Button>

      <BottomSheet
        title={labels.countryTitle}
        closeLabel={labels.close}
        open={picking}
        onClose={() => setPicking(false)}
      >
        <Input
          label={labels.countrySearch}
          type="search"
          iconStart="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
          className="mb-3"
        />
        {found.length === 0 && (
          <p className="px-2 py-4 text-center text-ink-muted" role="status">
            {labels.countryNone}
          </p>
        )}
        <ul className="flex flex-col">
          {found.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-sm px-2 text-start hover:bg-surface-sunken"
                aria-pressed={option.code === country.code}
                onClick={() => {
                  onCountryChange(option);
                  setPicking(false);
                }}
              >
                <CountryFlag code={option.code} size={16} />
                <span className="grow">{countryName(option, locale)}</span>
                <bdi dir="ltr" className="text-ink-muted">
                  {option.dialCode}
                </bdi>
                {option.code === country.code && <Icon name="check" />}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </Shell>
  );
}

// ---- Code (phone or email)

export interface CodeStepProps {
  labels: AuthLabels;
  via: 'whatsapp' | 'email';
  /** The phone number or email address the code went to. */
  target: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  /** Seconds until another code may be requested; 0 shows the resend button. */
  secondsLeft: number;
  busy?: boolean;
  error?: string | null;
}

/** Six boxes for the code. Filling the last one submits. */
export function CodeStep({
  labels,
  via,
  target,
  onSubmit,
  onResend,
  onBack,
  secondsLeft,
  busy,
  error,
}: CodeStepProps) {
  const [code, setCode] = useState('');
  const whatsapp = via === 'whatsapp';
  return (
    <Shell
      lead={{ icon: 'arrow-left', label: labels.back, onClick: onBack }}
      onSubmit={() => code.length === 6 && onSubmit(code)}
      footer={
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={code.length !== 6}
          loading={busy}
          loadingLabel={labels.checking}
        >
          {labels.verify}
        </Button>
      }
    >
      <span
        className={
          whatsapp
            ? 'flex size-14 items-center justify-center rounded-full bg-success-soft text-whatsapp'
            : 'flex size-14 items-center justify-center rounded-full bg-clay-soft text-clay'
        }
      >
        <Icon name={whatsapp ? 'brand-whatsapp' : 'mail'} size={28} />
      </span>
      <Heading title={labels.codeTitle}>
        {whatsapp ? labels.codeSentWhatsapp : labels.codeSentEmail} <Ltr>{target}</Ltr>.{' '}
        <button type="button" className="font-semibold text-clay" onClick={onBack}>
          {whatsapp ? labels.changeNumber : labels.changeEmail}
        </button>
      </Heading>
      <OtpInput
        label={labels.codeLabel}
        digitLabel={labels.digit}
        value={code}
        onChange={setCode}
        onComplete={onSubmit}
        error={error ?? undefined}
        disabled={busy}
        autoFocus
      />
      {secondsLeft > 0 ? (
        <p className="text-sm text-ink-muted" aria-live="off">
          {labels.resendIn} <Ltr>{formatCountdown(secondsLeft)}</Ltr>
        </p>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          iconStart={whatsapp ? 'brand-whatsapp' : 'mail'}
          onClick={onResend}
          disabled={busy}
        >
          {labels.resend}
        </Button>
      )}
    </Shell>
  );
}

// ---- Profile

export interface ProfileValues {
  name: string;
  homeEmirate: string;
  preferredLanguage: Locale;
  marketingConsent: boolean;
}

export interface ProfileStepProps {
  labels: AuthLabels;
  initial: ProfileValues;
  emirates: Array<{ value: string; label: string }>;
  /** Shown when this screen is what creates the account; it cannot be submitted unticked. */
  askTerms: boolean;
  onSubmit: (values: ProfileValues) => void;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Name, home emirate, language and consent, asked once for a new account. */
export function ProfileStep({
  labels,
  initial,
  emirates,
  askTerms,
  onSubmit,
  onBack,
  busy,
  error,
}: ProfileStepProps) {
  const [values, setValues] = useState(initial);
  const [agreed, setAgreed] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const set = (patch: Partial<ProfileValues>) => setValues((current) => ({ ...current, ...patch }));

  const submit = () => {
    const name = values.name.trim();
    setNameMissing(!name);
    if (!name || (askTerms && !agreed)) return;
    onSubmit({ ...values, name });
  };

  return (
    <Shell
      lead={{ icon: 'arrow-left', label: labels.back, onClick: onBack }}
      onSubmit={submit}
      footer={
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={askTerms && !agreed}
          loading={busy}
          loadingLabel={labels.saving}
        >
          {labels.startExploring}
        </Button>
      }
    >
      <Heading title={labels.profileTitle}>{labels.profileBody}</Heading>
      <Input
        label={labels.name}
        value={values.name}
        error={nameMissing ? labels.nameRequired : undefined}
        autoComplete="name"
        maxLength={120}
        onChange={(event) => set({ name: event.target.value })}
        autoFocus
      />
      <Select
        label={labels.emirate}
        hint={labels.emirateHint}
        placeholder={labels.emiratePlaceholder}
        options={emirates}
        value={values.homeEmirate}
        onChange={(event) => set({ homeEmirate: event.target.value })}
      />
      <Select
        label={labels.language}
        options={LOCALES.map((locale) => ({ value: locale, label: LANGUAGE_NAMES[locale] }))}
        value={values.preferredLanguage}
        onChange={(event) => set({ preferredLanguage: event.target.value as Locale })}
      />
      <div className="flex flex-col border-t border-line pt-1">
        {askTerms && (
          <Checkbox
            label={labels.agree}
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
        )}
        <Checkbox
          label={labels.marketing}
          description={labels.marketingHint}
          checked={values.marketingConsent}
          onChange={(event) => set({ marketingConsent: event.target.checked })}
        />
      </div>
      <FormError message={error} />
    </Shell>
  );
}

// ---- Email and password

export interface EmailStepProps {
  labels: AuthLabels;
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (input: { password: string; termsAccepted: boolean }) => void;
  onForgot: () => void;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Sign in with a password, or create an email account. One screen, two modes. */
export function EmailStep({
  labels,
  mode,
  onModeChange,
  email,
  onEmailChange,
  onSubmit,
  onForgot,
  onBack,
  busy,
  error,
}: EmailStepProps) {
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const registering = mode === 'register';
  return (
    <Shell
      lead={{ icon: 'arrow-left', label: labels.back, onClick: onBack }}
      onSubmit={() => onSubmit({ password, termsAccepted: agreed })}
    >
      <Heading title={registering ? labels.emailRegisterTitle : labels.emailLoginTitle}>
        {labels.emailWhy}
      </Heading>
      <Input
        label={labels.emailLabel}
        type="email"
        inputMode="email"
        dir="ltr"
        value={email}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        onChange={(event) => onEmailChange(event.target.value)}
        autoFocus
      />
      <PasswordField
        label={labels.passwordLabel}
        hint={registering ? labels.passwordHint : undefined}
        value={password}
        onChange={setPassword}
        autoComplete={registering ? 'new-password' : 'current-password'}
        labels={labels}
      />
      {registering && (
        <Checkbox
          label={labels.agree}
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
      )}
      <FormError message={error} />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={busy}
        loadingLabel={registering ? labels.creatingAccount : labels.signingIn}
      >
        {registering ? labels.createAccount : labels.signIn}
      </Button>
      <div className="flex flex-col items-start gap-1">
        {!registering && (
          <Button variant="ghost" size="sm" onClick={onForgot}>
            {labels.forgotPassword}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onModeChange(registering ? 'login' : 'register')}
        >
          {registering ? labels.toLogin : labels.toRegister}
        </Button>
        <Button variant="ghost" size="sm" iconStart="brand-whatsapp" onClick={onBack}>
          {labels.usePhone}
        </Button>
      </div>
    </Shell>
  );
}

export interface ForgotStepProps {
  labels: AuthLabels;
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Asks for the address to send a password reset code to. */
export function ForgotStep({
  labels,
  email,
  onEmailChange,
  onSubmit,
  onBack,
  busy,
  error,
}: ForgotStepProps) {
  return (
    <Shell lead={{ icon: 'arrow-left', label: labels.back, onClick: onBack }} onSubmit={onSubmit}>
      <Heading title={labels.forgotTitle}>{labels.forgotBody}</Heading>
      <Input
        label={labels.emailLabel}
        type="email"
        inputMode="email"
        dir="ltr"
        value={email}
        error={error ?? undefined}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        onChange={(event) => onEmailChange(event.target.value)}
        autoFocus
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={busy}
        loadingLabel={labels.sending}
      >
        {labels.sendResetCode}
      </Button>
    </Shell>
  );
}

export interface ResetStepProps {
  labels: AuthLabels;
  email: string;
  onSubmit: (input: { code: string; newPassword: string }) => void;
  onResend: () => void;
  onBack: () => void;
  secondsLeft: number;
  busy?: boolean;
  error?: string | null;
}

/** The emailed code and a new password, together. */
export function ResetStep({
  labels,
  email,
  onSubmit,
  onResend,
  onBack,
  secondsLeft,
  busy,
  error,
}: ResetStepProps) {
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  return (
    <Shell
      lead={{ icon: 'arrow-left', label: labels.back, onClick: onBack }}
      onSubmit={() => onSubmit({ code, newPassword })}
    >
      <Heading title={labels.resetTitle}>
        {labels.resetBody} <Ltr>{email}</Ltr>.
      </Heading>
      <OtpInput
        label={labels.codeLabel}
        digitLabel={labels.digit}
        value={code}
        onChange={setCode}
        autoFocus
      />
      <PasswordField
        label={labels.newPasswordLabel}
        hint={labels.passwordHint}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        labels={labels}
      />
      <FormError message={error} />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={code.length !== 6}
        loading={busy}
        loadingLabel={labels.saving}
      >
        {labels.setPassword}
      </Button>
      {secondsLeft > 0 ? (
        <p className="text-sm text-ink-muted">
          {labels.resendIn} <Ltr>{formatCountdown(secondsLeft)}</Ltr>
        </p>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          iconStart="mail"
          onClick={onResend}
          disabled={busy}
        >
          {labels.resend}
        </Button>
      )}
    </Shell>
  );
}
