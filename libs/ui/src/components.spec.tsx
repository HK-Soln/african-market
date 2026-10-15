import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Badge,
  BottomSheet,
  Button,
  Checkbox,
  formatPhoneAsTyped,
  phonePlaceholder,
  UAE,
  fillOtpDigits,
  formatAED,
  Icon,
  IconButton,
  Input,
  LanguageSwitcher,
  LinkButton,
  Logo,
  Modal,
  OtpInput,
  PhoneInput,
  Price,
  Select,
  Tabs,
  Toast,
  Toggle,
} from './index';
import { ICON_PATHS } from './icon-paths';

const html = renderToStaticMarkup;

describe('formatAED', () => {
  it('puts the code first with two decimals and comma thousands', () => {
    expect(formatAED(24.5)).toBe('AED 24.50');
    expect(formatAED(1240)).toBe('AED 1,240.00');
    expect(formatAED(1234567.891)).toBe('AED 1,234,567.89');
    expect(formatAED(0)).toBe('AED 0.00');
  });
});

describe('fillOtpDigits', () => {
  const empty = ['', '', '', '', '', ''];

  it('puts one typed digit in its box and moves on', () => {
    expect(fillOtpDigits(empty, 0, '4', 6)).toEqual({
      values: ['4', '', '', '', '', ''],
      focus: 1,
    });
  });

  it('spreads a pasted code across the boxes', () => {
    expect(fillOtpDigits(empty, 0, '482199', 6)).toEqual({
      values: ['4', '8', '2', '1', '9', '9'],
      focus: 5,
    });
  });

  it('ignores spaces, letters and digits past the last box', () => {
    expect(fillOtpDigits(empty, 0, ' 48-21 99 77', 6).values.join('')).toBe('482199');
    expect(fillOtpDigits(empty, 4, '123', 6).values).toEqual(['', '', '', '', '1', '2']);
  });

  it('clears a box when its digit is deleted', () => {
    expect(fillOtpDigits(['4', '8', '', '', '', ''], 1, '', 6)).toEqual({
      values: ['4', '', '', '', '', ''],
      focus: 1,
    });
  });
});

describe('Icon', () => {
  it('is hidden from assistive technology unless it has a label', () => {
    expect(html(<Icon name="heart" />)).toContain('aria-hidden="true"');
    const labelled = html(<Icon name="heart" label="Saved" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Saved"');
    expect(labelled).not.toContain('aria-hidden');
  });

  it('mirrors directional icons in RTL, unless told not to', () => {
    expect(html(<Icon name="arrow-left" />)).toContain('am-icon-dir');
    expect(html(<Icon name="arrow-left" flip={false} />)).not.toContain('am-icon-dir');
    expect(html(<Icon name="phone" />)).not.toContain('am-icon-dir');
  });

  it('holds only static path markup', () => {
    for (const markup of Object.values(ICON_PATHS))
      expect(markup).toMatch(/^(<path d="[^"<>]+" \/> ?)+$/);
  });
});

describe('Button', () => {
  it('defaults to a secondary button that does not submit forms', () => {
    const markup = html(<Button>Save hours</Button>);
    expect(markup).toContain('type="button"');
    expect(markup).toContain('am-btn-secondary');
  });

  it('announces loading and swaps in the loading label', () => {
    const markup = html(
      <Button variant="primary" loading loadingLabel="Saving">
        Save hours
      </Button>,
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Saving');
    expect(markup).not.toContain('Save hours');
  });

  it('renders links with the same classes', () => {
    const markup = html(
      <LinkButton variant="whatsapp" href="https://wa.me/971501234567">
        WhatsApp
      </LinkButton>,
    );
    expect(markup).toMatch(/^<a /);
    expect(markup).toContain('am-btn-whatsapp');
  });

  it('gives an icon-only button an accessible name', () => {
    expect(html(<IconButton icon="x" label="Close" />)).toContain('aria-label="Close"');
  });
});

describe('form fields', () => {
  it('ties the label, the control and the hint together', () => {
    const markup = html(<Input id="name" label="Your name" hint="As sellers will see it" />);
    expect(markup).toContain('<label class="am-field-label" for="name">');
    expect(markup).toContain('aria-describedby="name-msg"');
    expect(markup).toContain('id="name-msg"');
  });

  it('marks an invalid field and shows the error instead of the hint', () => {
    const markup = html(
      <Input
        id="makani"
        label="Makani number"
        hint="Optional"
        error="Makani numbers have 10 digits."
      />,
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('Makani numbers have 10 digits.');
    expect(markup).not.toContain('Optional');
  });

  it('renders select options with an optional placeholder', () => {
    const markup = html(
      <Select
        label="Home emirate"
        placeholder="Choose an emirate"
        options={[{ value: 'DXB', label: 'Dubai' }]}
      />,
    );
    expect(markup).toContain('<option value="">Choose an emirate</option>');
    expect(markup).toContain('<option value="DXB">Dubai</option>');
  });

  it('keeps the phone field left-to-right and defaults to the UAE', () => {
    const markup = html(<PhoneInput label="Mobile number" countryLabel="Country code" />);
    expect(markup).toContain('class="am-phone min-w-0" dir="ltr"');
    expect(markup).toContain(UAE.dialCode);
    expect(markup).toContain('placeholder="50 123 4567"');
    expect(markup).toContain('src="/flags/AE.svg"');
    expect(markup).toContain('aria-label="Country code: United Arab Emirates +971"');
    expect(markup).toContain('type="tel"');
  });

  it('lays out six left-to-right code boxes and asks the phone for the code', () => {
    const markup = html(
      <OtpInput label="Verification code" digitLabel="Digit" defaultValue="48" />,
    );
    expect(markup.match(/am-otp-box/g)).toHaveLength(6);
    expect(markup).toContain('class="am-otp" dir="ltr"');
    expect(markup).toContain('autoComplete="one-time-code"');
    expect(markup).toContain('aria-label="Digit 6"');
    expect(markup).toContain('value="4"');
  });

  it('renders a toggle as a switch and a checkbox as a checkbox', () => {
    expect(html(<Toggle label="Order updates" />)).toContain('role="switch"');
    expect(html(<Checkbox label="I agree" />)).toContain('type="checkbox"');
  });
});

describe('Tabs and LanguageSwitcher', () => {
  it('marks the selected tab and keeps the others out of the tab order', () => {
    const markup = html(
      <Tabs
        label="Shop sections"
        defaultValue="about"
        items={[
          { id: 'products', label: 'Products', count: 42 },
          { id: 'about', label: 'About' },
        ]}
      />,
    );
    expect(markup).toContain('role="tablist" aria-label="Shop sections"');
    expect(markup).toMatch(
      /aria-selected="true" tabindex="0" class="am-tab am-tab-on"[^>]*>.*About/,
    );
    expect(markup).toMatch(/aria-selected="false" tabindex="-1"/);
  });

  it('writes each language in its own script with its own lang attribute', () => {
    const markup = html(
      <LanguageSwitcher value="ar" onChange={() => undefined} label="Language" />,
    );
    expect(markup).toContain('lang="ar"');
    expect(markup).toContain('العربية');
    expect(markup).toMatch(/aria-checked="true" lang="ar"/);
  });
});

describe('Badge and Price', () => {
  it('gives each status its icon and lets a badge go without one', () => {
    expect(html(<Badge tone="verified">Verified</Badge>)).toContain('<svg');
    expect(html(<Badge tone="sponsored">Sponsored</Badge>)).not.toContain('<svg');
    expect(
      html(
        <Badge tone="open" icon={false}>
          Open
        </Badge>,
      ),
    ).not.toContain('<svg');
  });

  it('isolates the amount left-to-right', () => {
    expect(html(<Price amount={24.5} from="From" unit="kg" />)).toContain(
      '<bdi dir="ltr" class="am-price-amount">AED 24.50</bdi>',
    );
  });
});

describe('overlays and messages', () => {
  it('renders nothing when closed', () => {
    expect(html(<Modal title="Delete this branch?" open={false} />)).toBe('');
    expect(html(<BottomSheet title="Filters" closeLabel="Close" open={false} />)).toBe('');
  });

  it('labels a dialog by its title and uses alertdialog for blocking choices', () => {
    const markup = html(<Modal title="Delete this branch?" alert />);
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toMatch(/aria-labelledby="([^"]+)".*<h2 id="\1"/);
  });

  it('announces errors assertively and other toasts politely', () => {
    expect(html(<Toast tone="danger" title="Not saved" />)).toContain('role="alert"');
    expect(html(<Toast tone="success" title="Saved" />)).toContain('role="status"');
  });
});

describe('Logo', () => {
  it('has one accessible name and hides its parts', () => {
    const markup = html(<Logo />);
    expect(markup).toContain('role="img" aria-label="African Market UAE"');
    expect(markup).toContain('African Market');
    expect(html(<Logo variant="mark" />)).not.toContain('am-logo-word');
  });
});

describe('components.css', () => {
  const css = readFileSync(join(__dirname, '..', 'components.css'), 'utf8');
  const theme = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');

  it('only uses tokens that theme.css defines', () => {
    const defined = new Set([...theme.matchAll(/(--[a-z0-9\\.-]+)\s*:/g)].map((m) => m[1]));
    // Set locally by components.css itself, or by next/font in the apps.
    const local = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[a-z0-9\\.-]+)/g)].map((m) => m[1]));
    const missing = [...used].filter((name) => !defined.has(name) && !local.has(name));
    expect(missing).toEqual([]);
  });

  it('never positions with physical left or right', () => {
    const physical = css.match(/[^-](margin|padding)-(left|right)\s*:|[^-a-z](left|right)\s*:/g);
    expect(physical ?? []).toEqual([]);
  });
});

describe('phone numbers per country', () => {
  const nigeria = { code: 'NG', dialCode: '+234' };

  it('suggests a typical number for the country', () => {
    expect(phonePlaceholder(UAE)).toBe('50 123 4567');
    expect(phonePlaceholder(nigeria)).toBe('802 123 4567');
  });

  it('groups the digits the way the country writes them, as they are typed', () => {
    expect(formatPhoneAsTyped(UAE, '50123')).toBe('50 123');
    expect(formatPhoneAsTyped(UAE, '0501234567')).toBe('50 123 4567');
    expect(formatPhoneAsTyped(nigeria, '8021234567')).toBe('802 123 4567');
    expect(formatPhoneAsTyped(UAE, '')).toBe('');
    // Too long to be a number: left as typed, for the server to refuse.
    expect(formatPhoneAsTyped(UAE, '5012345678999')).toBe('5012345678999');
  });
});
