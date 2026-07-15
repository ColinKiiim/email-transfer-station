import { expect, test } from '@playwright/test';

import { FRONTEND_URL } from '../../fixtures/test-helpers';

const announcement = [
  '<h2 id="fixture-announcement" style="color:red" onclick="alert(1)">Maintenance window</h2>',
  '<strong>Saturday 02:00 UTC</strong>',
  '<img src="https://tracker.example/announcement-pixel" onerror="alert(2)">',
  '<script>alert(3)</script>',
  '<a href="javascript:alert(4)">bad link</a>',
  '<a href="https://safe.example/status" target="_self">safe status</a>',
].join('');

const oauthIcon = [
  '<svg viewBox="0 0 24 24" onload="alert(5)">',
  '<path d="M0 0h24v24z" fill="url(https://tracker.example/paint)" style="display:block" />',
  '<foreignObject><img src="https://tracker.example/oauth-pixel" onerror="alert(6)"></foreignObject>',
  '<animate attributeName="x" from="0" to="10" />',
  '<circle cx="12" cy="12" r="4" fill="#2563eb" />',
  '</svg>',
].join('');

test.describe('Browser HTML trust boundaries', () => {
  test('sanitizes operator content and OAuth SVG without tracker requests', async ({ page }) => {
    const trackerRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('tracker.example')) trackerRequests.push(request.url());
    });

    await page.route('**/open_api/settings', async (route) => {
      await route.fulfill({
        json: {
          domains: ['example.test'],
          defaultDomains: ['example.test'],
          announcement,
          alwaysShowAnnouncement: true,
          enableIndexAbout: true,
        },
      });
    });
    await page.route('**/api/settings', async (route) => {
      await route.fulfill({
        json: {
          address: 'html-boundary@example.test',
          auto_reply: { enabled: false },
          send_balance: 0,
        },
      });
    });
    await page.route('**/api/mails?*', async (route) => {
      await route.fulfill({ json: { results: [], count: 0 } });
    });
    await page.route('**/user_api/open_settings', async (route) => {
      await route.fulfill({
        json: {
          enable: false,
          enableMailVerify: false,
          oauth2ClientIDs: [{ clientID: 'fixture', name: 'Fixture Provider', icon: oauthIcon }],
        },
      });
    });

    await page.goto(`${FRONTEND_URL}/en/?jwt=html-boundary-token`);

    const notification = page.locator('.n-notification').filter({ hasText: 'Maintenance window' }).first();
    await expect(notification).toBeVisible();
    await expect(notification.locator('strong')).toHaveText('Saturday 02:00 UTC');
    await expect(notification.locator('script, img, [style], [onclick]')).toHaveCount(0);
    await expect(notification.getByText('bad link')).not.toHaveAttribute('href');
    const notificationLink = notification.getByRole('link', { name: 'safe status' });
    await expect(notificationLink).toHaveAttribute('target', '_blank');
    await expect(notificationLink).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(notificationLink).toHaveAttribute('referrerpolicy', 'no-referrer');

    await page.locator('.n-tabs-tab').filter({ hasText: 'About' }).click();
    const about = page.locator('.center').filter({ hasText: 'Email Transfer Station' });
    const aboutAnnouncement = about.getByRole('heading', { name: 'Maintenance window' }).locator('..');
    await expect(aboutAnnouncement).toBeVisible();
    await expect(aboutAnnouncement.locator('script, img, [style], [onclick]')).toHaveCount(0);
    await expect(aboutAnnouncement.getByRole('link', { name: 'safe status' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );

    await page.goto(`${FRONTEND_URL}/en/user`);
    const providerButton = page.getByRole('button', { name: /Fixture Provider/ });
    await expect(providerButton).toBeVisible();
    await expect(page.locator('.n-button--loading')).toHaveCount(0);
    await expect(page.getByText('loading...', { exact: true })).toHaveCount(0);
    const icon = providerButton.locator('.oauth2-icon');
    await expect(icon.locator('svg')).toHaveCount(1);
    await expect(icon.locator('path')).toHaveCount(1);
    await expect(icon.locator('circle')).toHaveAttribute('fill', '#2563eb');
    await expect(icon.locator('foreignObject, animate, img, a, [onload], [style], [href]')).toHaveCount(0);
    await expect(icon.locator('path')).not.toHaveAttribute('fill');

    await page.setViewportSize({ width: 375, height: 844 });
    await page.reload();
    await expect(providerButton).toBeVisible();
    await expect(page.locator('.n-button--loading')).toHaveCount(0);
    await expect(page.getByText('loading...', { exact: true })).toHaveCount(0);
    const mobileNotification = page.locator('.n-notification').filter({ hasText: 'Maintenance window' }).first();
    await expect(mobileNotification).toBeVisible();
    await expect.poll(() => mobileNotification.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    })).toBe(true);
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    await expect.poll(() => trackerRequests).toEqual([]);
  });
});
