import { expect, messages, newPhone, test, type TestLocale } from '../fixtures';

// The first core journey: a new person signs up with a phone number and a WhatsApp code, fills
// in the short profile and ends up signed in. Run in English and in Arabic (right-to-left).

const cases: Array<{ locale: TestLocale; dir: 'ltr' | 'rtl'; emirate: string }> = [
  { locale: 'en', dir: 'ltr', emirate: 'SHJ' },
  { locale: 'ar', dir: 'rtl', emirate: 'DXB' },
];

for (const { locale, dir, emirate } of cases) {
  test(`sign up by phone code in /${locale}`, async ({ page, api }) => {
    const t = messages[locale];
    const phone = newPhone();
    const name = 'Adaeze Okafor';

    await page.goto(`/${locale}/sign-in`);
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await expect(page.getByRole('heading', { name: t.auth.phoneTitle })).toBeVisible();

    await page.getByLabel(t.auth.phoneLabel).fill(phone.national);
    await page.getByRole('button', { name: t.auth.sendCode }).click();

    // The code screen names the number, left-to-right even in Arabic.
    await expect(page.getByRole('heading', { name: t.auth.codeTitle })).toBeVisible();
    await expect(page.getByText(phone.e164)).toBeVisible();

    // A wrong code is refused and says how many tries are left.
    const code = await api.otpFor(phone.e164);
    const wrong = code === '000000' ? '111111' : '000000';
    await page.getByLabel(`${t.auth.digit} 1`).fill(wrong);
    await expect(page.getByRole('alert')).toBeVisible();

    // Filling the boxes with the right one submits by itself.
    await page.getByLabel(`${t.auth.digit} 1`).fill(code);

    // A new phone: the profile screen, where the account is actually created.
    await expect(page.getByRole('heading', { name: t.auth.profileTitle })).toBeVisible();
    const submit = page.getByRole('button', { name: t.auth.startExploring });
    await expect(submit).toBeDisabled();
    await page.getByLabel(t.auth.name).fill(name);
    await page.getByLabel(t.auth.emirate).selectOption(emirate);
    await page.getByLabel(t.auth.agree).check();
    await expect(submit).toBeEnabled();
    await submit.click();

    // Signed in, on the home page, still in the language they chose.
    const account = page.getByRole('button', { name: `${t.account.account}: ${name}` });
    await expect(account).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.locator('html')).toHaveAttribute('dir', dir);

    // The session survives a reload.
    await page.reload();
    await expect(account).toBeVisible();

    // And the server agrees about who they are.
    const me = await page.evaluate(async (gateway) => {
      const response = await fetch(`${gateway}/api/v1/me`, { credentials: 'include' });
      return (await response.json()) as { user: Record<string, unknown> };
    }, process.env.E2E_GATEWAY_URL ?? 'http://localhost:4100');
    expect(me.user).toMatchObject({
      phone: phone.e164,
      name,
      homeEmirate: emirate,
      preferredLanguage: locale,
      phoneVerified: true,
    });
  });
}

test('a signed-in person can sign out', async ({ page, signedIn }) => {
  const t = messages.en;
  await page.goto('/en');

  await page.getByRole('button', { name: `${t.account.account}: ${signedIn.name}` }).click();
  const sheet = page.getByRole('dialog', { name: signedIn.name });
  await sheet.getByRole('button', { name: t.account.signOut }).click();

  await expect(page.getByRole('button', { name: t.account.signIn })).toBeVisible();
  // Signed out for real: a reload does not bring the session back.
  await page.reload();
  await expect(page.getByRole('button', { name: t.account.signIn })).toBeVisible();
});
