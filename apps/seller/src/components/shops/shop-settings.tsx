'use client';

import { useState, type ComponentProps } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, EmptyState, Icon, Skeleton, type IconName } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { Link, useRouter } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { useSellerShop } from '@/lib/shops';
import { LanguageSwitcher } from '../language-switcher';

type Row = {
  icon: IconName;
  label: string;
  hint: string;
  href: ComponentProps<typeof Link>['href'];
};

/**
 * One place for everything about the shop and the account: each part of the shop's page links to
 * the form that changes it, then language, personal data and signing out. Team members (Phase 2)
 * and checkout (Phase 3) join here later.
 */
export function ShopSettings({ shopId }: { shopId: string }) {
  const t = useTranslations('settings');
  const s = useTranslations('setup');
  const a = useTranslations('account');
  const locale = useLocale();
  const session = useSession();
  const router = useRouter();
  const { state } = useSellerShop(shopId);
  const [leaving, setLeaving] = useState(false);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton width="50%" height={32} />
        <Skeleton variant="block" height={300} />
      </div>
    );
  }
  if (state.status === 'error') return <EmptyState icon="building-store" title={s('notFound')} />;

  const shop = state.shop;
  const step = (name: string) => ({ pathname: `/shops/${shop.id}/setup`, query: { step: name } });
  const rows: Row[] = [
    { icon: 'building-store', label: t('details'), hint: t('detailsHint'), href: step('details') },
    { icon: 'phone', label: t('contacts'), hint: t('contactsHint'), href: step('contacts') },
    { icon: 'photo', label: t('photos'), hint: t('photosHint'), href: step('photos') },
    {
      icon: 'map-pin',
      label: t('branches'),
      hint: t('branchesHint'),
      href: `/shops/${shop.id}/branches`,
    },
    {
      icon: 'rosette-discount-check',
      label: t('verification'),
      hint: t('verificationHint'),
      href: `/shops/${shop.id}/verification`,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href={`/shops/${shop.id}`} className="self-start text-sm font-semibold text-clay-ink">
          {shop.name}
        </Link>
        <h1 className="text-[26px] leading-8 font-bold">{t('title')}</h1>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="settings-shop">
        <h2 id="settings-shop" className="text-lg font-semibold">
          {t('shop')}
        </h2>
        <Card className="p-0">
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.label}>
                <Link href={row.href} className="flex items-center gap-3 p-4">
                  <Icon name={row.icon} className="shrink-0 text-clay" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{row.label}</span>
                    <span className="text-sm text-ink-muted">{row.hint}</span>
                  </span>
                  <Icon name="chevron-right" className="shrink-0 text-ink-muted rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {shop.verificationStatus === 'verified' && (
          <a
            href={`${config.webUrl}/${locale}/s/${shop.slug}`}
            target="_blank"
            rel="noopener"
            className="self-start text-sm font-semibold text-clay-ink"
          >
            {t('viewPublic')}
          </a>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="settings-account">
        <h2 id="settings-account" className="text-lg font-semibold">
          {t('account')}
        </h2>
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">{t('language')}</span>
              <span className="text-sm text-ink-muted">{t('languageHint')}</span>
            </span>
            <LanguageSwitcher />
          </div>
          <div className="flex flex-col gap-1 border-t border-line pt-4">
            <a
              href={`${config.webUrl}/${locale}/account`}
              className="self-start font-semibold text-clay-ink"
            >
              {a('yourData')}
            </a>
            <span className="text-sm text-ink-muted">{t('dataHint')}</span>
          </div>
          <Button
            className="self-start"
            loading={leaving}
            loadingLabel={a('signingOut')}
            onClick={async () => {
              setLeaving(true);
              await session.signOut();
              router.replace('/sign-in');
            }}
          >
            {a('signOut')}
          </Button>
        </Card>
      </section>
    </div>
  );
}
