import { expect, test, type Page } from '@playwright/test';
import type { Story } from '@paralleax/shared';
import { paginated } from './editorTestHarness';

test('registers, creates a story, signs out, and signs back in', async ({ page }) => {
  let authenticated = false;
  const stories: Story[] = [];
  const user = {
    id: 'user-1',
    email: 'author@example.com',
    displayName: 'Author',
    role: 'user' as const,
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
  const signIn = page.getByRole('link', { name: 'Sign in' });
  const createAccount = page.getByRole('link', { name: 'Create account' });
  await expect(page.getByRole('group', { name: 'Account access' })).toBeVisible();
  await expect(signIn).toBeVisible();
  await expect(createAccount).toBeVisible();

  await signIn.focus();
  await expect(signIn).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(createAccount).toBeFocused();

  const actionStyles = await Promise.all(
    [signIn, createAccount].map((action) =>
      action.evaluate((element) => {
        const style = getComputedStyle(element);
        return { backgroundColor: style.backgroundColor, color: style.color };
      }),
    ),
  );
  expect(actionStyles[0]).not.toEqual(actionStyles[1]);

  await page.setViewportSize({ width: 360, height: 640 });
  await expectAccountActionsToFit(page, 'Sign in', 'Create account');
  await page.getByLabel('Language').selectOption('fr');
  await expectAccountActionsToFit(page, 'Se connecter', 'Créer un compte');
  await page.getByLabel('Langue').selectOption('en');

  await createAccount.click();
  await page.getByLabel('Display name').fill('Author');
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

async function expectAccountActionsToFit(page: Page, signInName: string, createName: string) {
  const responsiveSignIn = page.getByRole('link', { name: signInName });
  const responsiveCreateAccount = page.getByRole('link', { name: createName });
  await expect(responsiveSignIn).toBeInViewport();
  await expect(responsiveCreateAccount).toBeInViewport();
  const [signInBox, createAccountBox] = await Promise.all([
    responsiveSignIn.boundingBox(),
    responsiveCreateAccount.boundingBox(),
  ]);
  expect(signInBox).not.toBeNull();
  expect(createAccountBox).not.toBeNull();
  expect(signInBox!.x + signInBox!.width).toBeLessThanOrEqual(createAccountBox!.x);
  expect(createAccountBox!.x + createAccountBox!.width).toBeLessThanOrEqual(360);
}
