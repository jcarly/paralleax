import { expect, test } from '@playwright/test';

import { prepareEditorPage } from './editorTestHarness';

async function openRegistrationPage(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } }),
  );
  await page.goto('/register');
}

test('dismisses focused help with Escape without hiding the field or action', async ({ page }) => {
  await openRegistrationPage(page);
  const trigger = page.getByRole('button', { name: '? — Display name' });
  const tooltip = page.getByRole('tooltip');
  const displayName = page.getByRole('textbox', { name: 'Display name' });
  const submit = page.getByRole('button', { name: 'Create account' });

  await expect(displayName).toBeVisible();
  await expect(submit).toBeVisible();
  await trigger.focus();
  await expect(tooltip).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(tooltip).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(displayName).toBeVisible();
  await expect(submit).toBeVisible();
});

test('keeps hover help reachable while the pointer moves onto it', async ({ page }) => {
  await openRegistrationPage(page);
  const trigger = page.getByRole('button', { name: '? — Display name' });
  const tooltip = page.getByRole('tooltip');

  await trigger.hover();
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
});

test('dismisses focused help before Escape closes its containing dialog', async ({ page }) => {
  await prepareEditorPage(page);
  await page.goto('/stories/story-1/edit');
  const settingsButton = page.getByRole('button', { name: 'Story settings' });
  await settingsButton.click();

  const dialog = page.getByRole('dialog', { name: 'Story settings' });
  const trigger = dialog.getByRole('button', { name: '? — Story start date and time' });
  const tooltip = page.getByRole('tooltip');
  await trigger.focus();
  await expect(tooltip).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(tooltip).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
});
