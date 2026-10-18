'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Stepper } from '@am/ui';

/** Every onboarding step, including those built in the next part (photos, verification). */
export const ALL_STEPS = ['details', 'branch', 'hours', 'contacts', 'photos', 'verify'] as const;
export type AnyStep = (typeof ALL_STEPS)[number];

/** A setup screen: where the seller is in the setup, what this step is for, then the form. */
export function SetupFrame({
  step,
  title,
  intro,
  children,
}: {
  step: AnyStep;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const t = useTranslations('setup');
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-2 pb-16">
      <Stepper
        label={t('label')}
        stepLabel={t('stepOf', { n: '{n}', total: '{total}' })}
        doneLabel={t('done')}
        steps={ALL_STEPS.map((s) => t(`step${s}`))}
        current={ALL_STEPS.indexOf(step)}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-8 font-bold">{title}</h1>
        {intro && <p className="text-ink-muted">{intro}</p>}
      </header>
      {children}
    </main>
  );
}
