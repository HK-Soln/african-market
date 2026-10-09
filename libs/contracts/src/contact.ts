/** Builds a WhatsApp click-to-chat link. `phoneE164` like "+971501234567". */
export function buildWhatsAppLink(phoneE164: string, message?: string): string {
  const digits = phoneE164.replace(/[^\d]/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

export type ContactChannel = 'whatsapp' | 'call' | 'email' | 'chat';
