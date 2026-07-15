import { expect, test } from '@playwright/test';

import { TEST_DOMAIN, WORKER_URL } from '../../fixtures/test-helpers';

test.describe('Admin console', () => {
  test('preserves route state and completes an isolated mail deletion', async ({ page, request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subject = `Admin console fixture ${suffix}`;
    const created = await request.post(`${WORKER_URL}/api/admin/new_address`, {
      data: { name: `admin-ui-${suffix}`, domain: TEST_DOMAIN },
    });
    expect(created.ok()).toBe(true);
    const address = await created.json();

    try {
      const seeded = await request.post(`${WORKER_URL}/api/admin/test/receive_mail`, {
        data: {
          from: `sender@${TEST_DOMAIN}`,
          to: address.address,
          raw: [
            `From: sender@${TEST_DOMAIN}`,
            `To: ${address.address}`,
            `Subject: ${subject}`,
            `Message-ID: <${suffix}@test>`,
            'Content-Type: text/html; charset=utf-8',
            '',
            '<p>Isolated admin console fixture</p>',
          ].join('\r\n'),
        },
      });
      expect(seeded.ok()).toBe(true);

      await page.goto('/admin?view=flow');
      await expect(page.locator('.admin-next.app')).toBeVisible();
      const row = page.locator('.mail-row', { hasText: subject });
      await expect(row).toBeVisible();
      await row.click();
      await expect(page).toHaveURL(/view=flow/);
      await expect(page).toHaveURL(/mailId=mail-/);
      await expect(page).toHaveURL(/mode=detail/);

      const detailUrl = page.url();
      await page.reload();
      await expect(page.locator('.mail-row[aria-selected="true"]', { hasText: subject })).toBeVisible();

      const search = page.locator('.searchbox input');
      await search.fill(subject);
      await expect(page).toHaveURL(/q=Admin(?:\+|%20)console/);
      await expect(page.locator('.mail-row', { hasText: subject })).toHaveCount(1);

      await page.goto('/admin?view=overview');
      await page.goto(detailUrl);
      await page.goBack();
      await expect(page).toHaveURL(/view=overview/);
      await page.goForward();
      await expect(page).toHaveURL(/view=flow/);
      await expect(page.locator('.mail-row[aria-selected="true"]', { hasText: subject })).toBeVisible();

      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('.mail-reader-actions .danger').click();
      await expect(page.locator('.toast')).toContainText('已删除 1 封生产邮件');
      await expect(page.locator('.mail-row', { hasText: subject })).toHaveCount(0);
    } finally {
      await request.delete(`${WORKER_URL}/api/admin/delete_address/${address.address_id}`);
    }
  });
});
