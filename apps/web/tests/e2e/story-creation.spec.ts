import { expect, test } from '@playwright/test';
import type { Story } from '@paralleax/shared';
import { cloneStory, paginated, prepareEditorPage } from './editorTestHarness';

test('creates a linked opening graph and focuses its root in the editor', async ({ page }) => {
  const createdStory: Story = {
    ...cloneStory(),
    title: 'New story',
    interactions: [
      {
        id: 'interaction-root',
        title: 'Start',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'interaction-child',
        title: 'New interaction',
        body: '',
        position: { x: 80, y: 252 },
        triggers: [
          {
            id: 'trigger-child',
            inputInteractionIds: ['interaction-root'],
            conditions: [],
          },
        ],
      },
    ],
  };

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
