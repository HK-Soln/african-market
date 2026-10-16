import { renderToStaticMarkup } from 'react-dom/server';
import {
  AUTH_LABEL_KEYS,
  AuthFlow,
  CodeStep,
  composePhone,
  EmailStep,
  formatCountdown,
  ProfileStep,
  ResetStep,
  safeNextPath,
  type AuthFlowActions,
  type AuthLabels,
} from './index';

const html = renderToStaticMarkup;

/** Every label is its own key in brackets, so a test can see which one landed where. */
const labels = Object.fromEntries(AUTH_LABEL_KEYS.map((key) => [key, `[${key}]`])) as AuthLabels;

const never = () => {
  throw new Error('not expected to be called while rendering');
};
const actions: AuthFlowActions = {
  requestOtp: never,
  verifyOtp: never,
  register: never,
  resendEmailCode: never,
  verifyEmail: never,
  login: never,
  forgotPassword: never,
  resetPassword: never,
  updateProfile: never,
};

describe('composePhone', () => {
  it('puts the country code in front of a local number', () => {
    expect(composePhone('+971', '50 123 4567')).toBe('+971501234567');
    expect(composePhone('+234', '803-123-4567')).toBe('+2348031234567');
  });

  it('drops the leading zero people type at home', () => {
    expect(composePhone('+971', '050 123 4567')).toBe('+971501234567');
  });

  it('keeps a full international number whatever country is picked', () => {
    expect(composePhone('+971', '+234 803 123 4567')).toBe('+2348031234567');
    expect(composePhone('+971', '00234 803 123 4567')).toBe('+2348031234567');
  });

  it('is empty when nothing usable was typed', () => {
    expect(composePhone('+971', '')).toBe('');
    expect(composePhone('+971', ' - ')).toBe('');
  });
});

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('safeNextPath', () => {
  it('keeps a path inside the site', () => {
    expect(safeNextPath('/shops/abc?tab=menu')).toBe('/shops/abc?tab=menu');
  });

  it('refuses anything that could leave the site', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'shops']) {
      expect(safeNextPath(next)).toBe('/');
    }
    expect(safeNextPath(undefined, '/home')).toBe('/home');
    expect(safeNextPath(null)).toBe('/');
  });
});

describe('AuthFlow', () => {
  const markup = html(
    <AuthFlow
      actions={actions}
      labels={labels}
      errorText={(code) => code}
      locale="ar"
      emirates={[{ value: 'DXB', label: 'Dubai' }]}
      termsHref="/ar/legal/terms"
      privacyHref="/ar/legal/privacy"
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );

  it('opens on the phone number, with WhatsApp as the one primary action', () => {
    expect(markup).toContain('[phoneTitle]');
    expect(markup).toContain('[sendCode]');
    expect(markup.match(/am-btn-primary/g)).toHaveLength(1);
    expect(markup).toContain('[continueWithEmail]');
    expect(markup).toContain('[notNow]');
  });

  it('links the terms and the privacy policy it was given', () => {
    expect(markup).toContain('href="/ar/legal/terms"');
    expect(markup).toContain('href="/ar/legal/privacy"');
  });

  it('shows no sign-in method that is not built yet', () => {
    expect(markup).not.toMatch(/google|apple|facebook|passkey/i);
  });
});

describe('CodeStep', () => {
  const base = {
    labels,
    target: '+971501234567',
    onSubmit: () => undefined,
    onResend: () => undefined,
    onBack: () => undefined,
  };

  it('keeps the phone number left-to-right and counts down to the resend', () => {
    const markup = html(<CodeStep {...base} via="whatsapp" secondsLeft={42} />);
    expect(markup).toContain('<bdi dir="ltr" class="font-bold text-ink">+971501234567</bdi>');
    expect(markup).toContain('[codeSentWhatsapp]');
    expect(markup).toContain('0:42');
    expect(markup).not.toContain('[resend]');
    expect(markup.match(/am-otp-box/g)).toHaveLength(6);
  });

  it('offers the resend once the wait is over, and says where an emailed code went', () => {
    const markup = html(<CodeStep {...base} via="email" target="a@b.co" secondsLeft={0} />);
    expect(markup).toContain('[resend]');
    expect(markup).toContain('[codeSentEmail]');
    expect(markup).toContain('[changeEmail]');
  });

  it('announces a wrong code', () => {
    const markup = html(<CodeStep {...base} via="whatsapp" secondsLeft={5} error="Wrong code" />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Wrong code');
  });
});

describe('ProfileStep', () => {
  const base = {
    labels,
    initial: {
      name: '',
      homeEmirate: '',
      preferredLanguage: 'fr' as const,
      marketingConsent: false,
    },
    emirates: [
      { value: 'DXB', label: 'Dubai' },
      { value: 'SHJ', label: 'Sharjah' },
    ],
    onSubmit: () => undefined,
    onBack: () => undefined,
  };

  it('asks for the terms, unticked, and cannot be sent until they are accepted', () => {
    const markup = html(<ProfileStep {...base} askTerms />);
    expect(markup).toContain('[agree]');
    expect(markup).toMatch(/<button type="submit" disabled=""[^>]*am-btn-primary/);
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it('leaves the terms out for an account that already accepted them', () => {
    const markup = html(<ProfileStep {...base} askTerms={false} />);
    expect(markup).not.toContain('[agree]');
    expect(markup).toContain('[marketing]');
    expect(markup).not.toMatch(/<button type="submit" disabled/);
  });

  it('offers the emirates and each language in its own name', () => {
    const markup = html(<ProfileStep {...base} askTerms />);
    expect(markup).toContain('<option value="SHJ">Sharjah</option>');
    expect(markup).toContain('<option value="ar">العربية</option>');
    expect(markup).toContain('<option value="fr" selected="">Français</option>');
  });
});

describe('EmailStep and ResetStep', () => {
  const base = {
    labels,
    email: '',
    onEmailChange: () => undefined,
    onSubmit: () => undefined,
    onForgot: () => undefined,
    onBack: () => undefined,
    onModeChange: () => undefined,
  };

  it('signs in with the saved password and offers the reset', () => {
    const markup = html(<EmailStep {...base} mode="login" />);
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('[forgotPassword]');
    expect(markup).not.toContain('[agree]');
  });

  it('asks a new account for a new password and the terms', () => {
    const markup = html(<EmailStep {...base} mode="register" />);
    expect(markup).toContain('autoComplete="new-password"');
    expect(markup).toContain('[passwordHint]');
    expect(markup).toContain('[agree]');
    expect(markup).not.toContain('[forgotPassword]');
  });

  it('hides the password until asked', () => {
    const markup = html(<EmailStep {...base} mode="login" />);
    expect(markup).toContain('type="password"');
    expect(markup).toContain('[showPassword]');
  });

  it('takes the reset code and the new password together', () => {
    const markup = html(
      <ResetStep
        labels={labels}
        email="a@b.co"
        onSubmit={() => undefined}
        onResend={() => undefined}
        onBack={() => undefined}
        secondsLeft={0}
      />,
    );
    expect(markup.match(/am-otp-box/g)).toHaveLength(6);
    expect(markup).toContain('[newPasswordLabel]');
    expect(markup).toContain('[setPassword]');
  });
});

describe('AuthFlow social sign-in', () => {
  const props = {
    labels,
    errorText: (code: string) => code,
    locale: 'en' as const,
    emirates: [],
    termsHref: '/en/legal/terms',
    privacyHref: '/en/legal/privacy',
    onClose: never,
    onDone: never,
  };

  it('shows a button for each provider switched on', () => {
    const page = html(
      <AuthFlow
        {...props}
        actions={{ ...actions, socialSignIn: never }}
        social={{ google: { clientId: 'web-client' }, facebook: { appId: '111' } }}
      />,
    );
    expect(page).toContain('aria-label="[continueWithGoogle]"');
    expect(page).toContain('[continueWithFacebook]');
  });

  it('shows none when no provider is on, or the app cannot sign in with one', () => {
    const off = html(
      <AuthFlow {...props} actions={{ ...actions, socialSignIn: never }} social={{}} />,
    );
    expect(off).not.toContain('[continueWithFacebook]');
    const noAction = html(
      <AuthFlow {...props} actions={actions} social={{ facebook: { appId: '111' } }} />,
    );
    expect(noAction).not.toContain('[continueWithFacebook]');
  });
});
