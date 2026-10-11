import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_CATALOG,
  EVENT_NAMES,
  renderEventCatalog,
  type EventDoc,
  type EventName,
} from './events';

const DOC_PATH = join(__dirname, '..', '..', '..', 'docs', 'architecture', 'events.md');
const START = '<!-- events:start (generated from EVENT_CATALOG) -->';
const END = '<!-- events:end -->';

/** Prettier pads the tables in the file, so compare without the padding. */
const squeeze = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/-{3,}/g, '---')
    .replace(/ +\n/g, '\n')
    .trim();

describe('event contracts', () => {
  const entries = EVENT_NAMES.map(
    (name) => [name, EVENT_CATALOG[name] as EventDoc<EventName>] as const,
  );

  it('names every event <aggregate>.<past_verb>', () => {
    for (const name of EVENT_NAMES) {
      expect(name).toMatch(/^[a-z]+\.[a-z]+(_[a-z]+)*(\.v\d+)?$/);
    }
  });

  it('documents when each event is published and by which service', () => {
    for (const [name, doc] of entries) {
      expect([name, doc.description.length > 20]).toEqual([name, true]);
      expect([name, doc.publisher]).toEqual([name, expect.stringMatching(/^[a-z]+$/)]);
    }
  });

  it('documents every payload field of every event', () => {
    // That a field cannot be missing from the catalogue is checked by the compiler (the type of
    // EVENT_CATALOG); this checks nobody satisfied it with an empty string.
    for (const [name, doc] of entries) {
      const fields = Object.entries(doc.payload as Record<string, string>);
      expect([name, fields.length > 0]).toEqual([name, true]);
      for (const [field, meaning] of fields) {
        expect([name, field, meaning.trim().length > 5]).toEqual([name, field, true]);
      }
    }
  });

  it('carries no secrets or message bodies in a payload', () => {
    const forbidden = /password|token|secret|otp|code$|cardnumber|cvv|body|text/i;
    for (const [name, doc] of entries) {
      for (const field of Object.keys(doc.payload)) {
        expect([name, field, forbidden.test(field)]).toEqual([name, field, false]);
      }
    }
  });

  it('keeps docs/architecture/events.md in step with the catalogue', () => {
    const generated = renderEventCatalog();
    const current = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, 'utf8') : '';
    const start = current.indexOf(START);
    const end = current.indexOf(END);
    expect([start >= 0, end > start]).toEqual([true, true]);

    if (process.env.UPDATE_EVENT_DOCS === '1') {
      const updated = `${current.slice(0, start + START.length)}\n\n${generated}\n\n${current.slice(end)}`;
      writeFileSync(DOC_PATH, updated);
      return;
    }
    // If this fails: UPDATE_EVENT_DOCS=1 pnpm nx test @am/contracts, then pnpm format.
    expect(squeeze(current.slice(start + START.length, end))).toBe(squeeze(generated));
  });
});
