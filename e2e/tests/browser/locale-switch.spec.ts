import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { FRONTEND_URL } from '../../fixtures/test-helpers';

const installLocaleInitScript = async (page: Page, locales: string[], preferredLocale: string | null = null) => {
  await page.addInitScript(
    ({ locales: initialLocales, preferredLocale: initialPreferredLocale }: { locales: string[]; preferredLocale: string | null }) => {
      const localeInitStorageKey = '__localeInitDone';
      if (!window.sessionStorage.getItem(localeInitStorageKey)) {
        window.localStorage.removeItem('preferredLocale');
        if (initialPreferredLocale) {
          window.localStorage.setItem('preferredLocale', initialPreferredLocale);
        }
        window.sessionStorage.setItem(localeInitStorageKey, '1');
      }

      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        get: () => initialLocales[0],
      });
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        get: () => initialLocales,
      });
    },
    { locales, preferredLocale },
  );
};

test.describe('Locale switching', () => {
  test('redirects the default route to the browser language', async ({ page }) => {
    await installLocaleInitScript(page, ['en-GB', 'en-US']);

    await page.goto(`${FRONTEND_URL}/`);

    await expect(page).toHaveURL(`${FRONTEND_URL}/en/`);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('preferredLocale'))).toBe('en');
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('mobile utility menu updates locale route and persisted preference', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await installLocaleInitScript(page, ['zh-CN']);

    await page.goto(`${FRONTEND_URL}/`);

    await page.getByRole('button', { name: /外观与语言|Appearance and language/i }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/en/`);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('preferredLocale'))).toBe('en');
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
  });
});
