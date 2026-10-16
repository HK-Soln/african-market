/**
 * A legal text as the pages render it. The texts are content, not interface labels, so they live
 * here (one file per document, every locale side by side) rather than in messages/*.json.
 */
export interface LegalText {
  title: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

/** French until Phase 2 shows the English text (product rule 7). */
export type LegalTexts = { en: LegalText; ar: LegalText };
