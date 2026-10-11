'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@am/i18n';
import { COUNTRIES, type CountryCode } from '../countries';
import { composePhone, type AuthLabels } from './auth-helpers';
import {
  CodeStep,
  EmailStep,
  ForgotStep,
  PhoneStep,
  ProfileStep,
  ResetStep,
  type ProfileValues,
} from './auth-steps';

/** A call that worked, or failed with one of the gateway's stable error codes. */
export type AuthFlowResult<T> =
  { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

export interface AuthFlowUser {
  id: string;
  name: string | null;
  preferredLanguage: string;
  homeEmirate: string | null;
  marketingConsent: boolean;
}

interface CodeSent {
  resendAfterSeconds: number;
}

/**
 * What the flow needs from the server. The app passes functions built on `@am/api-client`, so
 * nothing in here fetches. None of them may throw.
 */
export interface AuthFlowActions {
  requestOtp(phone: string): Promise<AuthFlowResult<CodeSent & { phone: string }>>;
  verifyOtp(input: {
    phone: string;
    code: string;
    termsAccepted?: boolean;
    marketingConsent?: boolean;
    preferredLanguage?: string;
  }): Promise<AuthFlowResult<{ user: AuthFlowUser; isNewUser: boolean }>>;
  register(input: {
    email: string;
    password: string;
    termsAccepted: boolean;
    preferredLanguage?: string;
  }): Promise<AuthFlowResult<CodeSent>>;
  resendEmailCode(email: string): Promise<AuthFlowResult<CodeSent>>;
  verifyEmail(input: {
    email: string;
    code: string;
    password: string;
  }): Promise<AuthFlowResult<{ user: AuthFlowUser; isNewUser: boolean }>>;
  login(input: {
    email: string;
    password: string;
  }): Promise<AuthFlowResult<{ user: AuthFlowUser }>>;
  forgotPassword(email: string): Promise<AuthFlowResult<CodeSent>>;
  resetPassword(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<AuthFlowResult<{ user: AuthFlowUser }>>;
  updateProfile(patch: {
    name?: string | null;
    preferredLanguage?: string;
    homeEmirate?: string | null;
    marketingConsent?: boolean;
  }): Promise<AuthFlowResult<{ user: AuthFlowUser }>>;
}

export interface AuthFlowProps {
  actions: AuthFlowActions;
  labels: AuthLabels;
  /** The message for an error code, in the current language. */
  errorText: (code: string, details?: Record<string, unknown>) => string;
  /** The language of the page; a new account starts with it. */
  locale: Locale;
  /** The seven emirates, named in the current language. */
  emirates: Array<{ value: string; label: string }>;
  termsHref: string;
  privacyHref: string;
  /** Close or "Not now" on the first screen. */
  onClose: () => void;
  /** Signed in. The app stores the user and moves on, in the user's own language. */
  onDone: (user: AuthFlowUser, info: { isNewUser: boolean }) => void;
}

type Step =
  | { name: 'phone' }
  | { name: 'phone-code'; phone: string }
  /** `pending` is a phone whose code is right but whose account does not exist yet. */
  | { name: 'profile'; pending?: { phone: string; code: string }; user?: AuthFlowUser }
  | { name: 'email'; mode: 'login' | 'register' }
  | { name: 'email-code'; email: string; password: string }
  | { name: 'forgot' }
  | { name: 'reset'; email: string };

const MIN_PASSWORD = 10;

/** Counts down to a moment, in whole seconds. */
function useSecondsLeft(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * Sign-up and sign-in, from the Customer app design: phone number, WhatsApp code, then a short
 * profile for a new account; email and password as the second way in.
 *
 * A new phone account is created on the profile screen, not when the code is checked: the server
 * only creates one with the terms accepted, and that box is on the profile screen. The checked
 * code is kept in memory until then and is never stored.
 */
export function AuthFlow({
  actions,
  labels,
  errorText,
  locale,
  emirates,
  termsHref,
  privacyHref,
  onClose,
  onDone,
}: AuthFlowProps) {
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<CountryCode>('AE');
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const secondsLeft = useSecondsLeft(resendAt);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const waitFor = (seconds: number) => setResendAt(Date.now() + seconds * 1000);
  const fail = (result: { code: string; details?: Record<string, unknown> }) =>
    setError(errorText(result.code, result.details));

  /** Runs one server call with the button busy; a second tap while it runs is ignored. */
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  /** A code was sent a moment ago and still works, so carry on and show the wait. */
  const retryAfter = (result: { code: string; details?: Record<string, unknown> }) => {
    const seconds = result.details?.retryAfterSeconds;
    return result.code === 'OTP_RESEND_TOO_SOON' && typeof seconds === 'number' ? seconds : null;
  };

  const sendPhoneCode = (phone: string) =>
    run(async () => {
      if (!phone) return fail({ code: 'PHONE_INVALID' });
      const result = await actions.requestOtp(phone);
      if (result.ok) {
        waitFor(result.data.resendAfterSeconds);
        return go({ name: 'phone-code', phone: result.data.phone });
      }
      const wait = retryAfter(result);
      if (wait === null) return fail(result);
      waitFor(wait);
      if (step.name === 'phone') go({ name: 'phone-code', phone });
    });

  const verifyPhoneCode = (phone: string, code: string) =>
    run(async () => {
      const result = await actions.verifyOtp({ phone, code });
      if (result.ok) return onDone(result.data.user, { isNewUser: result.data.isNewUser });
      // The code is right but there is no account yet: ask for the details that create one.
      if (result.code === 'TERMS_NOT_ACCEPTED') {
        return go({ name: 'profile', pending: { phone, code } });
      }
      fail(result);
    });

  const saveProfile = (values: ProfileValues, pending?: { phone: string; code: string }) =>
    run(async () => {
      let isNewUser = false;
      if (pending) {
        const created = await actions.verifyOtp({
          ...pending,
          termsAccepted: true,
          marketingConsent: values.marketingConsent,
          preferredLanguage: values.preferredLanguage,
        });
        if (!created.ok) {
          // The code ran out while the form was open; the number is kept for a new one.
          if (['OTP_EXPIRED', 'OTP_INVALID', 'OTP_TOO_MANY_ATTEMPTS'].includes(created.code)) {
            setStep({ name: 'phone' });
          }
          return fail(created);
        }
        isNewUser = created.data.isNewUser;
      }
      const saved = await actions.updateProfile({
        name: values.name,
        homeEmirate: values.homeEmirate || null,
        preferredLanguage: values.preferredLanguage,
        marketingConsent: values.marketingConsent,
      });
      if (!saved.ok) return fail(saved);
      onDone(saved.data.user, { isNewUser: isNewUser || !pending });
    });

  const submitEmail = (mode: 'login' | 'register', password: string, termsAccepted: boolean) =>
    run(async () => {
      const address = email.trim();
      if (!address) return fail({ code: 'EMAIL_INVALID' });
      if (mode === 'register') {
        if (password.length < MIN_PASSWORD) {
          return fail({ code: 'PASSWORD_TOO_SHORT', details: { minLength: MIN_PASSWORD } });
        }
        if (!termsAccepted) return fail({ code: 'TERMS_NOT_ACCEPTED' });
        const result = await actions.register({
          email: address,
          password,
          termsAccepted: true,
          preferredLanguage: locale,
        });
        const wait = result.ok ? result.data.resendAfterSeconds : retryAfter(result);
        if (wait === null) return fail(result as { code: string });
        waitFor(wait);
        return go({ name: 'email-code', email: address, password });
      }
      if (!password) return fail({ code: 'INVALID_CREDENTIALS' });
      const result = await actions.login({ email: address, password });
      if (result.ok) return onDone(result.data.user, { isNewUser: false });
      if (result.code !== 'EMAIL_NOT_VERIFIED') return fail(result);
      // Registered but never confirmed: send the code again and pick up where they stopped.
      const resent = await actions.resendEmailCode(address);
      waitFor(resent.ok ? resent.data.resendAfterSeconds : (retryAfter(resent) ?? 0));
      go({ name: 'email-code', email: address, password });
    });

  const verifyEmailCode = (address: string, password: string, code: string) =>
    run(async () => {
      const result = await actions.verifyEmail({ email: address, code, password });
      if (!result.ok) return fail(result);
      if (!result.data.isNewUser) return onDone(result.data.user, { isNewUser: false });
      go({ name: 'profile', user: result.data.user });
    });

  const resendTo = (send: () => Promise<AuthFlowResult<CodeSent>>) =>
    run(async () => {
      const result = await send();
      const wait = result.ok ? result.data.resendAfterSeconds : retryAfter(result);
      if (wait === null) return fail(result as { code: string });
      waitFor(wait);
    });

  const sendResetCode = () =>
    run(async () => {
      const address = email.trim();
      if (!address) return fail({ code: 'EMAIL_INVALID' });
      const result = await actions.forgotPassword(address);
      const wait = result.ok ? result.data.resendAfterSeconds : retryAfter(result);
      if (wait === null) return fail(result as { code: string });
      waitFor(wait);
      go({ name: 'reset', email: address });
    });

  const resetPassword = (address: string, code: string, newPassword: string) =>
    run(async () => {
      if (newPassword.length < MIN_PASSWORD) {
        return fail({ code: 'PASSWORD_TOO_SHORT', details: { minLength: MIN_PASSWORD } });
      }
      const result = await actions.resetPassword({ email: address, code, newPassword });
      if (!result.ok) return fail(result);
      onDone(result.data.user, { isNewUser: false });
    });

  switch (step.name) {
    case 'phone':
      return (
        <PhoneStep
          labels={labels}
          locale={locale}
          country={country}
          onCountryChange={setCountry}
          number={number}
          onNumberChange={setNumber}
          onSubmit={() => sendPhoneCode(composePhone(COUNTRIES[country].dial, number))}
          onEmail={() => go({ name: 'email', mode: 'login' })}
          onClose={onClose}
          termsHref={termsHref}
          privacyHref={privacyHref}
          busy={busy}
          error={error}
        />
      );
    case 'phone-code':
      return (
        <CodeStep
          key={step.phone}
          labels={labels}
          via="whatsapp"
          target={step.phone}
          onSubmit={(code) => verifyPhoneCode(step.phone, code)}
          onResend={() => sendPhoneCode(step.phone)}
          onBack={() => go({ name: 'phone' })}
          secondsLeft={secondsLeft}
          busy={busy}
          error={error}
        />
      );
    case 'profile':
      return (
        <ProfileStep
          labels={labels}
          initial={{
            name: step.user?.name ?? '',
            homeEmirate: step.user?.homeEmirate ?? '',
            preferredLanguage: locale,
            marketingConsent: step.user?.marketingConsent ?? false,
          }}
          emirates={emirates}
          askTerms={!!step.pending}
          onSubmit={(values) => saveProfile(values, step.pending)}
          // An email account already exists here, so leaving the form is simply being done.
          onBack={() => {
            if (step.user) onDone(step.user, { isNewUser: true });
            else go({ name: 'phone' });
          }}
          busy={busy}
          error={error}
        />
      );
    case 'email':
      return (
        <EmailStep
          key={step.mode}
          labels={labels}
          mode={step.mode}
          onModeChange={(mode) => go({ name: 'email', mode })}
          email={email}
          onEmailChange={setEmail}
          onSubmit={({ password, termsAccepted }) =>
            submitEmail(step.mode, password, termsAccepted)
          }
          onForgot={() => go({ name: 'forgot' })}
          onBack={() => go({ name: 'phone' })}
          busy={busy}
          error={error}
        />
      );
    case 'email-code':
      return (
        <CodeStep
          labels={labels}
          via="email"
          target={step.email}
          onSubmit={(code) => verifyEmailCode(step.email, step.password, code)}
          onResend={() => resendTo(() => actions.resendEmailCode(step.email))}
          onBack={() => go({ name: 'email', mode: 'login' })}
          secondsLeft={secondsLeft}
          busy={busy}
          error={error}
        />
      );
    case 'forgot':
      return (
        <ForgotStep
          labels={labels}
          email={email}
          onEmailChange={setEmail}
          onSubmit={sendResetCode}
          onBack={() => go({ name: 'email', mode: 'login' })}
          busy={busy}
          error={error}
        />
      );
    case 'reset':
      return (
        <ResetStep
          labels={labels}
          email={step.email}
          onSubmit={({ code, newPassword }) => resetPassword(step.email, code, newPassword)}
          onResend={() => resendTo(() => actions.forgotPassword(step.email))}
          onBack={() => go({ name: 'forgot' })}
          secondsLeft={secondsLeft}
          busy={busy}
          error={error}
        />
      );
  }
}
