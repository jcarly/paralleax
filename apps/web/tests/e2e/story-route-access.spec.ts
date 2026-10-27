import { expect, test } from '@playwright/test';
import {
  cloneStory,
  mockAuthenticatedUser,
  mockRuntimeStory,
  paginated,
} from './editorTestHarness';

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

test('opens an unlisted Story at its player URL without signing in', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } }),
  );
  await page.route('**/api/stories/public**', (route) => route.fulfill({ json: paginated([]) }));

  const unlistedStory = cloneStory();
  unlistedStory.access = {
    visibility: 'unlisted',
    editPolicy: 'owner',
    commentPolicy: 'editors',
  };
  unlistedStory.capabilities = {
    canRead: true,
    canEdit: false,
    canManage: false,
    canComment: false,
  };
  await mockRuntimeStory(page, unlistedStory);

  await page.goto('/stories/story-1/play');

  await expect(page.getByRole('heading', { name: 'Original title' })).toBeVisible();
  await expect(page.getByText('Sign in to save progress')).toBeVisible();
});
