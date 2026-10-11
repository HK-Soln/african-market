import { DEFAULT_LOCALE, isLocale, textDirection, Locale } from '@am/i18n';
import { OTP_TTL_SECONDS } from '../otp/otp.constants';
import { EmailMessage } from './email-provider';

const minutes = OTP_TTL_SECONDS / 60;

interface Copy {
  subject: string;
  heading: string;
  /** Lines before the code (or the whole body when there is no code). */
  intro: string[];
  /** Lines after the code. */
  outro: string[];
}

type Template = 'verify' | 'reset' | 'alreadyRegistered';

const COPY: Record<Template, Record<Locale, Copy>> = {
  verify: {
    en: {
      subject: 'Your African Market code',
      heading: 'Confirm your email address',
      intro: ['Enter this code to finish creating your African Market account:'],
      outro: [
        `It expires in ${minutes} minutes. Don't share it with anyone.`,
        "If you didn't ask for this, you can ignore this email.",
      ],
    },
    ar: {
      subject: 'رمز التحقق الخاص بك في السوق الأفريقي',
      heading: 'أكّد عنوان بريدك الإلكتروني',
      intro: ['أدخل هذا الرمز لإكمال إنشاء حسابك في السوق الأفريقي:'],
      outro: [
        `تنتهي صلاحيته خلال ${minutes} دقائق. لا تشاركه مع أي شخص.`,
        'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.',
      ],
    },
    fr: {
      subject: 'Votre code African Market',
      heading: 'Confirmez votre adresse e-mail',
      intro: ['Saisissez ce code pour terminer la création de votre compte African Market :'],
      outro: [
        `Il expire dans ${minutes} minutes. Ne le partagez avec personne.`,
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
      ],
    },
  },
  reset: {
    en: {
      subject: 'Reset your African Market password',
      heading: 'Reset your password',
      intro: ['Enter this code to choose a new password:'],
      outro: [
        `It expires in ${minutes} minutes. Don't share it with anyone.`,
        "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
      ],
    },
    ar: {
      subject: 'إعادة تعيين كلمة المرور في السوق الأفريقي',
      heading: 'أعد تعيين كلمة المرور',
      intro: ['أدخل هذا الرمز لاختيار كلمة مرور جديدة:'],
      outro: [
        `تنتهي صلاحيته خلال ${minutes} دقائق. لا تشاركه مع أي شخص.`,
        'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة. ستبقى كلمة مرورك كما هي.',
      ],
    },
    fr: {
      subject: 'Réinitialisez votre mot de passe African Market',
      heading: 'Réinitialisez votre mot de passe',
      intro: ['Saisissez ce code pour choisir un nouveau mot de passe :'],
      outro: [
        `Il expire dans ${minutes} minutes. Ne le partagez avec personne.`,
        "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail. Votre mot de passe ne change pas.",
      ],
    },
  },
  alreadyRegistered: {
    en: {
      subject: 'You already have an African Market account',
      heading: 'You already have an account',
      intro: [
        'Someone tried to create an African Market account with this email address, but one already exists.',
        'If that was you, sign in instead. If you forgot your password, choose "Forgot password" on the sign-in screen.',
        "If it wasn't you, you don't need to do anything.",
      ],
      outro: [],
    },
    ar: {
      subject: 'لديك حساب بالفعل في السوق الأفريقي',
      heading: 'لديك حساب بالفعل',
      intro: [
        'حاول شخص ما إنشاء حساب في السوق الأفريقي بهذا البريد الإلكتروني، لكن يوجد حساب مسجّل به بالفعل.',
        'إذا كنت أنت، سجّل الدخول. وإذا نسيت كلمة المرور، اختر «نسيت كلمة المرور» في شاشة تسجيل الدخول.',
        'إذا لم تكن أنت، فلا حاجة لاتخاذ أي إجراء.',
      ],
      outro: [],
    },
    fr: {
      subject: 'Vous avez déjà un compte African Market',
      heading: 'Vous avez déjà un compte',
      intro: [
        "Quelqu'un a essayé de créer un compte African Market avec cette adresse e-mail, mais il en existe déjà un.",
        "Si c'était vous, connectez-vous. Si vous avez oublié votre mot de passe, choisissez « Mot de passe oublié » sur l'écran de connexion.",
        "Si ce n'était pas vous, vous n'avez rien à faire.",
      ],
      outro: [],
    },
  },
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const resolveLocale = (locale?: string): Locale =>
  locale && isLocale(locale) ? locale : DEFAULT_LOCALE;

/**
 * Builds the text and HTML of an identity email in the reader's language. Colours are the
 * design system's, written out because email clients ignore stylesheets and variables.
 */
function build(
  template: Template,
  to: string,
  locale: string | undefined,
  code?: string,
): EmailMessage {
  const language = resolveLocale(locale);
  const copy = COPY[template][language];
  const dir = textDirection(language);
  // The code is isolated left-to-right so its digits never reorder inside Arabic.
  const textCode = code ? [language === 'ar' ? `⁦${code}⁩` : code] : [];
  const text = [
    copy.heading,
    '',
    ...copy.intro,
    ...textCode,
    '',
    ...copy.outro,
    '',
    'African Market UAE',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const paragraph = (line: string) =>
    `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#2a211b">${escapeHtml(line)}</p>`;
  const codeBlock = code
    ? `<p dir="ltr" style="margin:20px 0;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.2em;color:#a9500e;text-align:center">${escapeHtml(code)}</p>`
    : '';
  const html = `<!doctype html>
<html lang="${language}" dir="${dir}">
<body style="margin:0;padding:24px;background:#fbf6ef;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e8dccd;border-radius:16px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#2a211b">${escapeHtml(copy.heading)}</h1>
${copy.intro.map(paragraph).join('\n')}
${codeBlock}
${copy.outro.map(paragraph).join('\n')}
<p style="margin:20px 0 0;font-size:13px;color:#6b5e54">African Market UAE</p>
</div>
</body>
</html>`;

  return { to, subject: copy.subject, text, html };
}

export const verificationEmail = (to: string, code: string, locale?: string): EmailMessage =>
  build('verify', to, locale, code);

export const passwordResetEmail = (to: string, code: string, locale?: string): EmailMessage =>
  build('reset', to, locale, code);

/** Sent instead of a code when someone registers with an address that already has an account. */
export const alreadyRegisteredEmail = (to: string, locale?: string): EmailMessage =>
  build('alreadyRegistered', to, locale);
