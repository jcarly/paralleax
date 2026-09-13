import { expect, test } from '@playwright/test';
import { mockAuthenticatedUser, paginated } from './editorTestHarness';

test('returns inaccessible Story URLs to the library without exposing server details', async ({
  page,
}) => {
  await mockAuthenticatedUser(page);
  await page.route(/\/api\/stories(?:\?.*)?$/, (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/stories/private-story/**', (route) =>
    route.fulfill({ status: 404, json: { message: 'Story not found' } }),
  );

  for (const path of [
    '/stories/private-story/edit',
    '/stories/private-story/play',
    '/stories/private-story/access',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
    await expect(page.getByText('Story not found')).toHaveCount(0);
  }
});
