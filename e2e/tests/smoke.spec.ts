import { expect, messages, test, testNumber, type TestLocale } from '../fixtures';

// @smoke: the check that runs on staging after every deploy, where codes are real and cannot be
// read back. It signs in with a test number (a fixed code, never sent; OTP_TEST_NUMBERS in
// identity, E2E_TEST_NUMBERS here), in English and in Arabic. The same number is used on every
// run, so the first run creates the account and later runs sign in to it.

const cases: Array<{ locale: TestLocale; dir: 'ltr' | 'rtl'; index: number }> = [
  { locale: 'en', dir: 'ltr', index: 0 },
  { locale: 'ar', dir: 'rtl', index: 1 },
];

test.skip(!process.env.E2E_TEST_NUMBERS, 'needs E2E_TEST_NUMBERS (test numbers with fixed codes)');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const { locale, dir, index } of cases) {
  test(`@smoke signs in with a test number in /${locale}`, async ({ page }) => {
    const t = messages[locale];
    const number = testNumber(index);

    await page.goto(`/${locale}/sign-in`);
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await page.getByLabel(t.auth.phoneLabel).fill(number.national);
    await page.getByRole('button', { name: t.auth.sendCode }).click();
    await expect(page.getByRole('heading', { name: t.auth.codeTitle })).toBeVisible();
    await page.getByLabel(`${t.auth.digit} 1`).fill(number.code);

    // A first run creates the account; every later one signs straight in.
    const profile = page.getByRole('heading', { name: t.auth.profileTitle });
    const account = page.getByRole('button', {
      name: new RegExp(`^${escape(t.account.account)}: `),
    });
    await expect(profile.or(account)).toBeVisible();
    if (await profile.isVisible()) {
      await page.getByLabel(t.auth.name).fill('Staging Smoke');
      await page.getByLabel(t.auth.emirate).selectOption('DXB');
      await page.getByLabel(t.auth.agree).check();
      await page.getByRole('button', { name: t.auth.startExploring }).click();
    }
    await expect(account).toBeVisible();

    // Leave nothing signed in behind.
    await account.click();
    await page.getByRole('button', { name: t.account.signOut }).click();
    await expect(page.getByRole('button', { name: t.account.signIn })).toBeVisible();
  });
}
