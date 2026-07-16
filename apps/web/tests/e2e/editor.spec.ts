import { expect, test, type Page } from '@playwright/test';
import type { Story } from '@paralleax/shared';

const story: Story = {
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

function storyWithConditionCandidate(): Story {
  const next = cloneStory();
  next.interactions.push({
    id: 'interaction-2',
    title: 'Visited scene',
    body: 'A previous scene.',
    position: { x: 120, y: 300 },
    triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
  });
  return next;
}

async function mockStory(page: Page, initialStory: Story = cloneStory()) {
  await page.route('**/api/stories/story-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: structuredClone(initialStory) });
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
    await expect(page.getByLabel('Title')).toBeVisible();
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

  test('edits root trigger path conditions from the root trigger marker', async ({ page }) => {
    const initialStory = storyWithConditionCandidate();
    await mockStory(page, initialStory);
    const updated = structuredClone(initialStory);
    updated.interactions[0].triggers[0].conditions = [
      { interactionId: 'interaction-2', hasBeenVisited: true },
    ];

    await page.route(
      '**/api/stories/story-1/interactions/interaction-1/triggers/trigger-1',
      async (route) => {
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().postDataJSON()).toEqual({
          inputInteractionIds: [],
          conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
        });
        await route.fulfill({ json: updated });
      },
    );

    await page.goto('/stories/story-1/edit');
    await page
      .getByTestId('interaction-node')
      .filter({ hasText: 'Original title' })
      .getByRole('button', { name: 'Select root trigger' })
      .click();
    await page.getByRole('button', { name: 'Add condition' }).click();

    await expect(page.getByRole('heading', { name: 'Path conditions' })).toBeVisible();
    await expect(page.getByRole('combobox').first()).toHaveValue('interaction-2');
    await expect(page.getByRole('combobox').nth(1)).toHaveValue('visited');
  });
});
