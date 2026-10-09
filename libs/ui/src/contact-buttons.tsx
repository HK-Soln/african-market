import { buildWhatsAppLink, type ContactChannel } from '@am/contracts';
import { LinkButton } from './button';

export interface ContactButtonsProps {
  whatsapp?: string;
  phone?: string;
  email?: string;
  /** Prefilled WhatsApp message, e.g. naming the product and linking back. */
  message?: string;
  labels: Record<Exclude<ContactChannel, 'chat'>, string>;
  /** Called before navigation so the app can log a contact event (seller lead analytics). */
  onContact?: (channel: ContactChannel) => void;
}

/** WhatsApp, call and email buttons. Uses logical spacing so it mirrors correctly in Arabic. */
export function ContactButtons({
  whatsapp,
  phone,
  email,
  message,
  labels,
  onContact,
}: ContactButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp && (
        <LinkButton
          href={buildWhatsAppLink(whatsapp, message)}
          target="_blank"
          rel="noopener"
          onClick={() => onContact?.('whatsapp')}
        >
          {labels.whatsapp}
        </LinkButton>
      )}
      {phone && (
        <LinkButton variant="secondary" href={`tel:${phone}`} onClick={() => onContact?.('call')}>
          {labels.call}
        </LinkButton>
      )}
      {email && (
        <LinkButton
          variant="secondary"
          href={`mailto:${email}`}
          onClick={() => onContact?.('email')}
        >
          {labels.email}
        </LinkButton>
      )}
    </div>
  );
}
