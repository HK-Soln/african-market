import { LEGAL_VERSIONS } from '@am/contracts';

/**
 * What is stored when someone accepts the terms: when, and which versions of the terms and the
 * privacy policy were current (UAE PDPL: consent must be shown later, for the text it was given to).
 */
export const termsAcceptance = (now: Date) => ({
  termsAcceptedAt: now,
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
});
