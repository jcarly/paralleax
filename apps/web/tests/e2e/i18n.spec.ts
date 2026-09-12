import { expect, test } from '@playwright/test';
import { mockAuthenticatedUser, paginated, testAuthor } from './editorTestHarness';

test('switches and remembers the interface language without translating story titles', async ({
  page,
}) => {
  await mockAuthenticatedUser(page);
  await page.route('**/api/stories**', (route) =>
    route.fulfill({
      json: paginated([
        {
          id: 'story-1',
          title: 'A room full of echoes',
          interactionCount: 1,
          owner: { id: testAuthor.id, displayName: testAuthor.displayName },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    }),
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();

  await page.getByLabel('Language').selectOption('fr');
  await expect(page.getByRole('heading', { name: 'Histoires', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A room full of echoes', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.reload();
  await expect(page.getByLabel('Langue')).toHaveValue('fr');
  await expect(page.getByRole('heading', { name: 'Histoires', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A room full of echoes', exact: true }),
  ).toBeVisible();
});
