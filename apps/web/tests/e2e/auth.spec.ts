import { expect, test } from '@playwright/test';
import type { Story } from '@paralleax/shared';

test('registers, creates a story, signs out, and signs back in', async ({ page }) => {
  let authenticated = false;
  const stories: Story[] = [];
  const user = {
    id: 'user-1',
    email: 'author@example.com',
    createdAt: '2026-07-18T00:00:00.000Z',
  };

  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      authenticated
        ? { json: user }
        : { status: 401, body: JSON.stringify({ message: 'Authentication required' }) },
    ),
  );
  await page.route('**/api/auth/register', async (route) => {
    authenticated = true;
    await route.fulfill({ status: 201, json: user });
  });
  await page.route('**/api/auth/logout', async (route) => {
    authenticated = false;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/login', async (route) => {
    authenticated = true;
    await route.fulfill({ json: user });
  });
  await page.route('**/api/stories', async (route) => {
    if (route.request().method() === 'POST') {
      const story: Story = {
        id: 'story-1',
        title: 'New story',
        interactions: [],
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      };
      stories.push(story);
      await route.fulfill({ status: 201, json: story });
      return;
    }
    await route.fulfill({ json: stories });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByLabel('Email').fill('author@example.com');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
  await page.getByRole('button', { name: 'New story' }).click();
  await expect(page.getByRole('heading', { name: 'New story' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill('author@example.com');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'New story' })).toBeVisible();
});
