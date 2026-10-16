import { readFile } from 'node:fs/promises';
import { expect, messages, test, type TestLocale } from '../fixtures';
import { GATEWAY_URL } from '../urls';

// UAE PDPL basics (F0-16): the legal texts, the cookie notice, and a person downloading their
// data and deleting their account. In English and in Arabic.

const cases: Array<{ locale: TestLocale; dir: 'ltr' | 'rtl' }> = [
  { locale: 'en', dir: 'ltr' },
  { locale: 'ar', dir: 'rtl' },
];

for (const { locale, dir } of cases) {
  test.describe(`/${locale}`, () => {
    test('the terms and privacy policy say they are drafts awaiting legal review', async ({
      page,
    }) => {
      const t = messages[locale];
      await page.goto(`/${locale}/legal/privacy`);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.getByRole('note')).toContainText(t.legal.draftTitle);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.footer.privacy);

      await page
        .getByRole('navigation', { name: t.footer.label })
        .getByRole('link', { name: t.footer.terms })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/legal/terms$`));
      await expect(page.getByRole('note')).toContainText(t.legal.draftTitle);
    });

    test.describe('the cookie notice', () => {
      test.use({ cookieNoticeSeen: false });

      test('is shown once, until it is dismissed', async ({ page }) => {
        const t = messages[locale];
        await page.goto(`/${locale}`);
        const notice = page.getByRole('region', { name: t.cookies.label });
        await expect(notice).toContainText(t.cookies.body);
        await notice.getByRole('button', { name: t.cookies.ok }).click();
        await expect(notice).toBeHidden();
        await page.reload();
        // The header's sign-in button appears once the page is running in the browser.
        await expect(
          page.getByRole('button', { name: messages[locale].account.signIn }).first(),
        ).toBeVisible();
        await expect(notice).toBeHidden();
      });
    });

    test('a person downloads their data, then deletes their account', async ({
      page,
      signedIn,
    }) => {
      const t = messages[locale].accountPage;
      await page.goto(`/${locale}/account`);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.getByRole('heading', { name: t.title, level: 1 })).toBeVisible();

      // The copy of their data is a JSON file with their account in it.
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: t.download }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^african-market-data-\d{4}-\d{2}-\d{2}\.json$/);
      const file = JSON.parse(await readFile((await download.path()) as string, 'utf8'));
      expect(file).toMatchObject({
        format: 'african-market.identity/1',
        account: { phone: signedIn.phone, name: signedIn.name },
        consents: { termsVersion: expect.any(String) },
      });

      // Deleting asks first, and only once "I understand" is ticked.
      await page.getByRole('button', { name: t.deleteButton }).click();
      const dialog = page.getByRole('alertdialog', { name: t.confirmTitle });
      const confirm = dialog.getByRole('button', { name: t.confirmDelete });
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel(t.confirmCheck).check();
      await confirm.click();

      await expect(page.getByRole('heading', { name: t.deletedTitle })).toBeVisible();
      // Signed out on the server too.
      const status = await page.evaluate(async (gateway) => {
        const response = await fetch(`${gateway}/api/v1/me`, { credentials: 'include' });
        return response.status;
      }, GATEWAY_URL);
      expect(status).toBe(401);
    });
  });
}
