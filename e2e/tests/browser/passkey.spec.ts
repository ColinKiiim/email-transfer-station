import { expect, test } from '@playwright/test';

import { FRONTEND_URL } from '../../fixtures/test-helpers';

const openSettings = {
  domains: ['example.test'],
  defaultDomains: ['example.test'],
  announcement: '',
  alwaysShowAnnouncement: false,
  enableIndexAbout: true,
  enableGlobalTurnstileCheck: false,
};

const userOpenSettings = {
  enable: false,
  enableMailVerify: false,
  oauth2ClientIDs: [],
};

const userSettings = {
  user_email: 'passkey-hidden@example.test',
  user_id: 1,
  user_role: null,
  is_admin: false,
  can_bind_address: false,
  can_create_address: false,
  access_token: null,
  new_user_token: null,
};

test.describe('Passkey browser surface', () => {
  test('keeps archived Passkey controls out of login and account security', async ({ page }) => {
    await page.route('**/open_api/settings', (route) => route.fulfill({ json: openSettings }));
    await page.route('**/user_api/open_settings', (route) => route.fulfill({ json: userOpenSettings }));
    await page.route('**/user_api/settings', (route) => route.fulfill({ json: userSettings }));

    await page.goto(`${FRONTEND_URL}/en/user`);
    await expect(page.locator('.login-layout')).toBeVisible();
    await expect(page.getByRole('button', { name: /Passkey/i })).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem('userJwt', 'fixture-user-jwt'));
    await page.goto(`${FRONTEND_URL}/en/user`);
    await expect(page.getByText(userSettings.user_email)).toBeVisible();
    await page.getByRole('button', { name: /Account Security|账户设置/i }).click();
    await expect(page.getByRole('heading', { name: /Account Security|账户设置/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Passkey/i })).toHaveCount(0);
  });
});
