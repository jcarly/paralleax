import { expect, test } from '@playwright/test';
import type { Story } from '@paralleax/shared';
import { paginated } from './editorTestHarness';

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
  await page.route('**/api/stories**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/stories/public')) {
      await route.fulfill({ json: paginated([]) });
      return;
    }
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
    await route.fulfill({
      json: paginated(
        stories.map((story) => ({
          id: story.id,
          title: story.title,
          interactionCount: story.interactions.length,
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
        })),
      ),
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Email address').fill('author@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
  await page.getByLabel('Confirm password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Story title').fill('New story');
  await page.getByRole('button', { name: 'Create story' }).click();
  await expect(page.getByRole('heading', { name: 'New story', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Paralleax' })).toBeVisible();
  await page.getByLabel('Email address').fill('author@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'New story', exact: true })).toBeVisible();
});
