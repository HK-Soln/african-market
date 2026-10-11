/** One-time code rules (directive F0-03). */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
/** Wrong guesses allowed per code; after that the code is dead and a new one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
/** Wait before the first resend. It doubles with each further code sent in the same hour. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_RESEND_COOLDOWN_MAX_SECONDS = 15 * 60;
export const OTP_MAX_PER_PHONE_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 20;
/**
 * Codes go out on WhatsApp unless the caller asks for SMS (decision P-09). SMS is a fallback
 * that may be removed.
 */
export const DEFAULT_OTP_CHANNEL = 'whatsapp' as const;
