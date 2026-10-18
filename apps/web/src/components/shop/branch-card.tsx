import { getLocale, getTranslations } from 'next-intl/server';
import { formatAed, pickLocalized, type Locale } from '@am/i18n';
import { Badge, Icon } from '@am/ui';
import {
  hasNoHours,
  isOpenAt,
  laterSpecialDays,
  nextSevenDays,
  type SpecialDay,
} from '@/lib/shop/hours';
import type { PublicBranch, PublicShop } from '@/lib/shop/server';
import { ContactActions } from './contact-actions';

const time = (hhmm: string) => (
  <bdi dir="ltr" className="tabular-nums">
    {hhmm}
  </bdi>
);

/**
 * One branch: where it is, open or not, how it serves (pickup, delivery area), its week of hours
 * from today, and its own contact buttons when it has its own numbers or the shop has several.
 */
export async function BranchCard({
  shop,
  branch,
  now,
}: {
  shop: PublicShop;
  branch: PublicBranch;
  now: Date;
}) {
  const t = await getTranslations('shop');
  const e = await getTranslations('emirates');
  const locale = (await getLocale()) as Locale;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const specialLabel = (s: SpecialDay) => {
    const label = s.label ? pickLocalized(s.label, locale) : '';
    return label ? t('specialDay', { label }) : t('specialDayNoLabel');
  };

  const open = isOpenAt(branch, now);
  const week = nextSevenDays(branch, now);
  const later = laterSpecialDays(branch, now);
  const place = [branch.addressLine, branch.area, e(branch.emirate)].filter(Boolean).join(', ');

  const serving: string[] = [];
  if (branch.delivery) {
    serving.push(
      branch.serviceArea
        ? t('deliversArea')
        : branch.serviceRadiusM
          ? t('deliversRadius', { km: Math.round(branch.serviceRadiusM / 100) / 10 })
          : t('deliversArea'),
    );
    serving.push(
      branch.deliveryFeeFils > 0
        ? t('deliveryFee', { fee: formatAed(branch.deliveryFeeFils, locale) })
        : t('freeDelivery'),
    );
    if (branch.minOrderFils > 0) {
      serving.push(t('minOrder', { amount: formatAed(branch.minOrderFils, locale) }));
    }
    if (branch.pickup) serving.push(t('pickupToo'));
  } else if (branch.pickup) {
    serving.push(t('pickupOnly'));
  }

  const ownContacts = Boolean(branch.contactWhatsapp || branch.contactPhone || branch.contactEmail);

  return (
    <article
      id={`branch-${branch.id}`}
      className="flex scroll-mt-20 flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4"
    >
      <header className="flex flex-col gap-1">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-bold">
          {branch.name}
          {shop.branches.length > 1 && branch.isPrimary && (
            <Badge tone="neutral" icon={false}>
              {t('primary')}
            </Badge>
          )}
          {!hasNoHours(branch) && (
            <Badge tone={open ? 'open' : 'closed'}>{open ? t('openNow') : t('closedNow')}</Badge>
          )}
        </h3>
        <p className="flex items-start gap-1 text-sm text-ink-muted">
          <Icon name="map-pin" size={16} className="mt-0.5 shrink-0" />
          <span>
            {place}
            {branch.makani && (
              <>
                {' · '}
                {t('makani')} <bdi dir="ltr">{branch.makani}</bdi>
              </>
            )}
          </span>
        </p>
        {serving.length > 0 && (
          <p className="flex items-start gap-1 text-sm text-ink-muted">
            <Icon
              name={branch.delivery ? 'truck' : 'building-store'}
              size={16}
              className="mt-0.5 shrink-0"
            />
            <span>{serving.join(' · ')}</span>
          </p>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{t('hours')}</h4>
        {hasNoHours(branch) ? (
          <p className="text-sm text-ink-muted">{t('noHours')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {week.map((day) => (
                <tr
                  key={day.date}
                  aria-current={day.isToday ? 'date' : undefined}
                  className={day.isToday ? 'bg-clay-soft font-semibold' : undefined}
                >
                  <th scope="row" className="py-1 ps-2 text-start font-[inherit]">
                    {day.isToday ? t('today') : weekday.format(new Date(`${day.date}T00:00:00Z`))}
                  </th>
                  <td className="py-1 pe-2 text-end">
                    {day.periods.length === 0
                      ? t('closed')
                      : day.periods.map((p, i) => (
                          <span key={i} className="block">
                            {time(p.opensAt)}–{time(p.closesAt)}
                          </span>
                        ))}
                    {day.special && (
                      <span className="block text-xs text-warning">
                        {specialLabel(day.special)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {later.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold">{t('comingUp')}</p>
            <ul className="text-ink-muted">
              {later.map((s) => (
                <li key={s.date}>
                  {dayMonth.format(new Date(`${s.date}T00:00:00Z`))}:{' '}
                  {s.closed || !s.opensAt || !s.closesAt ? (
                    t('closed')
                  ) : (
                    <>
                      {time(s.opensAt)}–{time(s.closesAt)}
                    </>
                  )}{' '}
                  ({specialLabel(s)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {(ownContacts || shop.branches.length > 1) && (
        <ContactActions
          shopId={shop.id}
          branchId={branch.id}
          whatsapp={branch.contactWhatsapp ?? shop.contactWhatsapp}
          phone={branch.contactPhone ?? shop.contactPhone}
          email={branch.contactEmail ?? shop.contactEmail}
          message={t('whatsappHello', { shop: shop.name })}
        />
      )}
    </article>
  );
}
