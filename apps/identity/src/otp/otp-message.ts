import { DEFAULT_LOCALE, isLocale, Locale } from '@am/i18n';
import { OTP_TTL_SECONDS } from './otp.constants';

const minutes = OTP_TTL_SECONDS / 60;

/** The code is isolated left-to-right in Arabic so the digits never reorder. */
const templates: Record<Locale, (code: string) => string> = {
  en: (code) =>
    `Your African Market code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`,
  ar: (code) =>
    `رمز التحقق الخاص بك في السوق الأفريقي هو ⁦${code}⁩. تنتهي صلاحيته خلال ${minutes} دقائق. لا تشاركه مع أي شخص.`,
  fr: (code) =>
    `Votre code African Market est ${code}. Il expire dans ${minutes} minutes. Ne le partagez avec personne.`,
};

/** Text of the SMS or WhatsApp message that carries a one-time code. */
export function otpMessage(code: string, locale?: string): string {
  const key = locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
  return templates[key](code);
}
