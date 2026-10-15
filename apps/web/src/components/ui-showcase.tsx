'use client';

import { useState, type ReactNode } from 'react';
import { textDirection, type Locale } from '@am/i18n';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  IconButton,
  Input,
  LanguageSwitcher,
  LinkButton,
  Logo,
  Modal,
  OriginBadge,
  OtpInput,
  PhoneInput,
  Price,
  Radio,
  Select,
  Skeleton,
  Stepper,
  Tabs,
  Toast,
  Toggle,
} from '@am/ui';

/** Strings for one language, keyed as in the `devUi` messages namespace. */
export type ShowcaseStrings = Record<string, string>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Every shared component in one language and direction. Rendered twice by the dev page. */
export function UiShowcase({ locale, t }: { locale: Locale; t: ShowcaseStrings }) {
  const [language, setLanguage] = useState<Locale>(locale);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [code, setCode] = useState('4821');

  return (
    <div
      lang={locale}
      dir={textDirection(locale)}
      className="flex flex-col gap-8 rounded-lg border border-line bg-surface p-5"
    >
      <Group title={t.logo}>
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <Logo variant="mark" size={32} />
        </div>
      </Group>

      <Group title={t.buttons}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">{t.orderOnline}</Button>
          <Button>{t.saveHours}</Button>
          <Button variant="ghost" iconEnd="arrow-right">
            {t.continue}
          </Button>
          <Button variant="destructive">{t.deleteBranch}</Button>
          <Button variant="whatsapp" iconStart="brand-whatsapp">
            {t.whatsapp}
          </Button>
          <Button variant="primary" loading loadingLabel={t.saving}>
            {t.saveHours}
          </Button>
          <Button disabled>{t.saveHours}</Button>
          <Button size="sm">{t.small}</Button>
          <LinkButton href="#buttons" iconStart="phone">
            {t.call}
          </LinkButton>
          <IconButton icon="arrow-left" label={t.back} />
          <IconButton icon="heart" label={t.favourite} variant="secondary" />
        </div>
      </Group>

      <Group title={t.fields}>
        <div className="grid gap-4">
          <Input label={t.name} placeholder={t.namePlaceholder} autoComplete="name" />
          <Input
            label={t.building}
            optional={t.optional}
            hint={t.buildingHint}
            iconStart="map-pin"
          />
          <Input label={t.makani} defaultValue="12345" error={t.makaniError} dir="ltr" />
          <Select
            label={t.emirate}
            placeholder={t.choose}
            hint={t.emirateHint}
            options={[
              { value: 'DXB', label: t.dubai },
              { value: 'AUH', label: t.abuDhabi },
              { value: 'SHJ', label: t.sharjah },
            ]}
          />
          <PhoneInput label={t.phone} countryLabel={t.countryCode} hint={t.phoneHint} />
          <OtpInput
            label={t.code}
            digitLabel={t.digit}
            hint={t.codeHint}
            value={code}
            onChange={setCode}
          />
          <OtpInput label={t.code} digitLabel={t.digit} defaultValue="482199" error={t.codeError} />
        </div>
      </Group>

      <Group title={t.choices}>
        <div className="flex flex-col">
          <Checkbox label={t.terms} defaultChecked />
          <Checkbox label={t.marketing} description={t.marketingHint} />
          <Radio name={`fulfilment-${locale}`} label={t.pickup} defaultChecked />
          <Radio name={`fulfilment-${locale}`} label={t.delivery} />
          <Toggle label={t.notifications} defaultChecked />
        </div>
      </Group>

      <Group title={t.tabsAndChips}>
        <Tabs
          label={t.shopSections}
          items={[
            { id: 'products', label: t.products, count: 42 },
            { id: 'about', label: t.about },
            { id: 'reviews', label: t.reviews, count: 18 },
          ]}
        />
        <Tabs
          variant="segmented"
          label={t.view}
          items={[
            { id: 'list', label: t.list, icon: 'list' },
            { id: 'map', label: t.map, icon: 'map' },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Chip selected>{t.openNow}</Chip>
          <Chip icon="truck">{t.delivers}</Chip>
          <Chip flag="NG" count={12}>
            {t.nigeria}
          </Chip>
          <Chip dropdown>{t.distance}</Chip>
        </div>
        <LanguageSwitcher value={language} onChange={setLanguage} label={t.language} />
        <LanguageSwitcher
          variant="list"
          value={language}
          onChange={setLanguage}
          label={t.language}
        />
      </Group>

      <Group title={t.badges}>
        <div className="flex flex-wrap gap-2">
          <Badge tone="verified">{t.verified}</Badge>
          <Badge tone="sponsored">{t.sponsored}</Badge>
          <Badge tone="open">{t.openUntil}</Badge>
          <Badge tone="soon">{t.closesSoon}</Badge>
          <Badge tone="closed">{t.closed}</Badge>
          <Badge tone="delivers">{t.deliversToYou}</Badge>
          <Badge tone="checkout">{t.orderOnline}</Badge>
          <Badge tone="pending">{t.pending}</Badge>
          <Badge tone="rejected">{t.rejected}</Badge>
          <OriginBadge
            country={{ code: 'GH', name: { en: 'Ghana', ar: 'غانا', fr: 'Ghana' } }}
            locale={locale}
          />
        </div>
        <div className="flex flex-wrap items-baseline gap-6">
          <Price amount={24.5} />
          <Price amount={1240} from={t.from} unit={t.kg} size="lg" />
        </div>
      </Group>

      <Group title={t.cards}>
        <Card className="flex flex-col gap-2 p-3">
          <p className="font-semibold">Mama Nkechi African Foods</p>
          <p className="text-sm text-ink-muted">{t.cardBody}</p>
        </Card>
        <div aria-busy className="grid gap-2">
          <Skeleton width="70%" />
          <Skeleton width="45%" />
          <Skeleton variant="block" height={72} />
          <div className="flex gap-2">
            <Skeleton variant="circle" width={48} height={48} />
            <Skeleton variant="pill" />
          </div>
        </div>
        <Stepper
          label={t.shopSetup}
          stepLabel={t.stepOf}
          doneLabel={t.done}
          steps={[t.stepShop, t.stepBranch, t.stepVerify]}
          current={1}
        />
      </Group>

      <Group title={t.feedback}>
        <Toast tone="success" title={t.toastSaved} />
        <Toast tone="danger" title={t.toastFailed} action={t.retry} />
        <Toast
          tone="offline"
          title={t.toastOffline}
          onClose={() => undefined}
          closeLabel={t.dismiss}
        />
        <EmptyState
          title={t.emptyTitle}
          body={t.emptyBody}
          action={<Button variant="primary">{t.emptyAction}</Button>}
        />
      </Group>

      <Group title={t.overlays}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheetOpen(true)}>{t.openSheet}</Button>
          <Button onClick={() => setModalOpen(true)}>{t.openModal}</Button>
        </div>
        <BottomSheet
          title={t.filters}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          closeLabel={t.close}
          footer={
            <Button variant="primary" fullWidth onClick={() => setSheetOpen(false)}>
              {t.showShops}
            </Button>
          }
        >
          <Checkbox label={t.openNow} defaultChecked />
          <Checkbox label={t.delivers} />
        </BottomSheet>
        <Modal
          title={t.modalTitle}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          icon="alert-triangle"
          tone="danger"
          alert
          actions={
            <>
              <Button variant="destructive" onClick={() => setModalOpen(false)}>
                {t.deleteBranch}
              </Button>
              <Button onClick={() => setModalOpen(false)}>{t.keepBranch}</Button>
            </>
          }
        >
          {t.modalBody}
        </Modal>
      </Group>
    </div>
  );
}
