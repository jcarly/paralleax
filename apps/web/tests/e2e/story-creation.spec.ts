import { expect, test } from '@playwright/test';
import { paginated, prepareEditorPage, storyWithOpeningPath } from './editorTestHarness';

test('creates a linked opening graph and focuses its root in the editor', async ({ page }) => {
  const createdStory = storyWithOpeningPath();

  await page.route(/\/api\/stories(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: createdStory });
      return;
    }
    await route.fulfill({ json: paginated([]) });
  });
  await prepareEditorPage(page, createdStory);

  await page.goto('/');
  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Story title').fill('New story');
  await page.getByRole('button', { name: 'Create story' }).click();

  await expect(page).toHaveURL(/\/stories\/story-1\/edit$/);
  const rootNode = page.getByTestId('interaction-node').filter({ hasText: 'Start' });
  await expect(rootNode).toHaveClass(/selected/);
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Start');
});
