import { expect, test, type Page } from '@playwright/test';

const story = {
  id: 'story-1',
  title: 'Test story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Original title',
      body: 'Original content',
      position: { x: 120, y: 140 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
};

function cloneStory() {
  return structuredClone(story);
}

async function mockStory(page: Page) {
  await page.route('**/api/stories/story-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: cloneStory() });
      return;
    }

    await route.fallback();
  });
}

test.describe('Story editor', () => {
  test.beforeEach(async ({ page }) => {
    await mockStory(page);
  });

  test('edits an interaction title without blanking the page', async ({ page }) => {
    const updated = cloneStory();
    updated.interactions[0].title = 'New title';

    await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().postDataJSON()).toEqual({ title: 'New title' });
      await route.fulfill({ json: updated });
    });

    await page.goto('/stories/story-1/edit');
    await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
    await page.getByLabel('Title').fill('New title');
    await page.getByLabel('Title').blur();

    await expect(
      page.getByTestId('interaction-node').filter({ hasText: 'New title' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interaction' })).toBeVisible();
    await expect(page.getByText('Loading...')).toHaveCount(0);
  });

  test('keeps title and body visible after dragging an interaction', async ({ page }) => {
    const moved = cloneStory();
    moved.interactions[0].position = { x: 240, y: 180 };

    await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().postDataJSON()).toHaveProperty('position');
      await route.fulfill({ json: moved });
    });

    await page.goto('/stories/story-1/edit');
    const node = page.getByTestId('interaction-node').filter({ hasText: 'Original title' });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 40, {
      steps: 8,
    });
    await page.mouse.up();

    await expect(
      page.getByTestId('interaction-node').filter({ hasText: 'Original title' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('interaction-node').filter({ hasText: 'Original content' }),
    ).toBeVisible();
  });
});
