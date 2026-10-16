import { getTranslations } from 'next-intl/server';
import type { LegalText, LegalTexts } from '@/legal/types';

/** The text for a locale; French shows the English until Phase 2. */
export const legalText = (texts: LegalTexts, locale: string): LegalText =>
  locale === 'ar' ? texts.ar : texts.en;

/**
 * A legal text (terms, privacy policy), with a notice that it is a draft awaiting legal review
 * and the version that accepting it records (LEGAL_VERSIONS in @am/contracts).
 */
export async function LegalDocument({ text, version }: { text: LegalText; version: string }) {
  const t = await getTranslations('legal');
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-9 font-bold">{text.title}</h1>
        <p className="text-[13px] text-ink-muted">{t('version', { version })}</p>
      </header>
      <aside
        role="note"
        className="rounded-lg border border-warning bg-warning-soft p-4 text-[15px] leading-6"
      >
        <p className="font-semibold">{t('draftTitle')}</p>
        <p className="text-ink-muted">{t('draftBody')}</p>
      </aside>
      <p className="text-[17px] leading-7">{text.intro}</p>
      {text.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="text-[20px] leading-7 font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-[15px] leading-6">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
