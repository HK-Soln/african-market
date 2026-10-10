/** One-time code rules (directive F0-03). */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
/** Wrong guesses allowed per code; after that the code is dead and a new one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_PER_PHONE_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 20;
