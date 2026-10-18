'use client';

import { useTranslations } from 'next-intl';
import { ContactButtons } from '@am/ui';
import { recordContact } from '@/lib/contact';

export interface ContactActionsProps {
  shopId: string;
  branchId?: string;
  productId?: string;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  /** The WhatsApp message the customer starts with. */
  message?: string;
}

/** WhatsApp, call and email, each tap counted for the shop (decision T-33). */
export function ContactActions({
  shopId,
  branchId,
  productId,
  whatsapp,
  phone,
  email,
  message,
}: ContactActionsProps) {
  const t = useTranslations('shop');
  return (
    <ContactButtons
      whatsapp={whatsapp ?? undefined}
      phone={phone ?? undefined}
      email={email ?? undefined}
      message={message}
      labels={{ whatsapp: t('whatsapp'), call: t('call'), email: t('email') }}
      onContact={(channel) => {
        if (channel !== 'chat') recordContact({ shopId, branchId, productId, channel });
      }}
    />
  );
}
