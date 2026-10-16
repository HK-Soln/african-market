/**
 * The number to send to the server from what was typed beside a country code. The server does the
 * real validation and formatting; this only decides whether the country code applies.
 */
export function composePhone(dial: string, typed: string): string {
  const cleaned = typed.replace(/[^\d+]/g, '');
  // Someone who types a full international number means it, whatever the picker says.
  if (cleaned.startsWith('+')) return `+${cleaned.replace(/\D/g, '')}`;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  const dialDigits = dial.replace(/\D/g, '');
  const national = cleaned.replace(/^0+/, '');
  return national ? `+${dialDigits}${national}` : '';
}

/** Seconds as `m:ss`, for the resend timer. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Where to go after signing in. Only a path inside this site is accepted, so a crafted link
 * cannot use the sign-in page to send someone elsewhere.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}

/** Every string the sign-in screens show. The app fills these from its messages. */
export const AUTH_LABEL_KEYS = [
  'back',
  'close',
  'notNow',
  'or',
  'continueWithGoogle',
  'continueWithFacebook',
  'phoneTitle',
  'phoneWhy',
  'phoneLabel',
  'phoneHint',
  'countryLabel',
  'countryTitle',
  'countrySearch',
  'countryNone',
  'sendCode',
  'sending',
  'continueWithEmail',
  'termsLead',
  'terms',
  'and',
  'privacy',
  'codeTitle',
  'codeSentWhatsapp',
  'codeSentEmail',
  'changeNumber',
  'changeEmail',
  'codeLabel',
  'digit',
  'resendIn',
  'resend',
  'verify',
  'checking',
  'profileTitle',
  'profileBody',
  'name',
  'nameRequired',
  'emirate',
  'emirateHint',
  'emiratePlaceholder',
  'language',
  'agree',
  'marketing',
  'marketingHint',
  'startExploring',
  'saving',
  'emailLoginTitle',
  'emailRegisterTitle',
  'emailWhy',
  'emailLabel',
  'passwordLabel',
  'newPasswordLabel',
  'passwordHint',
  'showPassword',
  'hidePassword',
  'signIn',
  'signingIn',
  'createAccount',
  'creatingAccount',
  'forgotPassword',
  'toRegister',
  'toLogin',
  'usePhone',
  'forgotTitle',
  'forgotBody',
  'sendResetCode',
  'resetTitle',
  'resetBody',
  'setPassword',
] as const;

export type AuthLabelKey = (typeof AUTH_LABEL_KEYS)[number];
export type AuthLabels = Record<AuthLabelKey, string>;
