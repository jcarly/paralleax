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

function storyWithHorizontalLink(): Story {
  const next = cloneStory();
  next.interactions.push({
    id: 'interaction-2',
    title: 'Linked scene',
    body: 'A scene connected through a trigger.',
    position: { x: 680, y: 140 },
    triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
  });
  return next;
}

async function getEdgeEndDirection(page: Page, edgeId: string) {
  return page
    .locator(`[data-id="${edgeId}"] .react-flow__edge-path`)
    .evaluate((element: SVGPathElement) => {
      const length = element.getTotalLength();
      const before = element.getPointAtLength(Math.max(0, length - 8));
      const end = element.getPointAtLength(length);
      return { dx: end.x - before.x, dy: end.y - before.y };
    });
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
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 'user-1',
          email: 'author@example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
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

  test('edits and saves rich interaction content', async ({ page }) => {
    const richBody =
      '<p>A <strong>rich</strong> scene.</p><img src="https://media.example/scene.gif">';
    const updated = cloneStory();
    updated.interactions[0].body = richBody;

    await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().postDataJSON()).toEqual({ body: richBody });
      await route.fulfill({ json: updated });
    });

    await page.goto('/stories/story-1/edit');
    await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
    const content = page.getByRole('textbox', { name: 'Content' });
    await content.evaluate((element, html) => {
      element.innerHTML = html;
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, richBody);
    await content.blur();

    await expect(content.locator('strong')).toHaveText('rich');
    await expect(content.locator('img')).toHaveAttribute('src', 'https://media.example/scene.gif');
  });

  test('edits the story clock and interaction duration', async ({ page }) => {
    const timed = cloneStory();
    timed.startDateTime = '2026-07-27T09:30';
    timed.interactions[0].durationMinutes = 45;

    await page.route('**/api/stories/story-1', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fallback();
        return;
      }
      expect(route.request().postDataJSON()).toEqual({ startDateTime: '2026-07-27T09:30' });
      await route.fulfill({ json: timed });
    });
    await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().postDataJSON()).toEqual({ durationMinutes: 45 });
      await route.fulfill({ json: timed });
    });

    await page.goto('/stories/story-1/edit');
    await page.getByLabel('Story start date and time').fill('2026-07-27T09:30');
    await page.getByLabel('Story start date and time').blur();
    await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
    await page.getByLabel('Duration (minutes)').fill('45');
    await page.getByLabel('Duration (minutes)').blur();

    await expect(page.getByLabel('Story start date and time')).toHaveValue('2026-07-27T09:30');
    await expect(page.getByLabel('Duration (minutes)')).toHaveValue('45');
  });

  test('exposes location-owned item instances', async ({ page }) => {
    const locatedStory = cloneStory();
    locatedStory.locations = [
      {
        id: 'location-1',
        name: 'Harbor',
        description: 'A home with persistent supplies.',
        items: [{ id: 'supply-1', itemDefinitionId: 'supply-definition' }],
      },
    ];
    locatedStory.itemDefinitions = [
      { id: 'supply-definition', name: 'Household supplies', description: '' },
    ];
    await mockStory(page, locatedStory);

    await page.goto('/stories/story-1/edit');
    await page.getByRole('button', { name: 'Harbor', exact: true }).click();

    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.getByRole('heading', { name: 'Location' })).toBeVisible();
    await expect(inspector.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(inspector.getByText('Household supplies')).toBeVisible();
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

  test('drags and saves a linked trigger marker', async ({ page }) => {
    const current = storyWithHorizontalLink();
    await mockStory(page, current);
    let savedPosition: { x: number; y: number } | undefined;

    await page.route(
      '**/api/stories/story-1/interactions/interaction-2/triggers/trigger-2',
      async (route) => {
        expect(route.request().method()).toBe('PATCH');
        const patch = route.request().postDataJSON() as {
          position: { x: number; y: number };
        };
        expect(Object.keys(patch)).toEqual(['position']);
        savedPosition = patch.position;
        const trigger = structuredClone(current.interactions[1].triggers[0]);
        trigger.position = patch.position;
        await route.fulfill({
          json: {
            interactionId: 'interaction-2',
            trigger,
            revision: 2,
            updatedAt: current.updatedAt,
          },
        });
      },
    );

    await page.goto('/stories/story-1/edit');
    const marker = page.getByTestId('flow-trigger-interaction-2-trigger-2');
    const box = await marker.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2 + 60, {
      steps: 8,
    });
    await page.mouse.up();

    await expect.poll(() => savedPosition?.x).toBeGreaterThan(495);
    await expect(marker).toBeVisible();
  });

  test('reorients the output arrow when its target moves across the trigger', async ({ page }) => {
    let current = storyWithHorizontalLink();
    await mockStory(page, current);

    await page.route('**/api/stories/story-1/interactions/interaction-2', async (route) => {
      const patch = route.request().postDataJSON() as {
        position: { x: number; y: number };
      };
      current = structuredClone(current);
      current.interactions[1].position = patch.position;
      await route.fulfill({ json: current });
    });

    await page.goto('/stories/story-1/edit');
    const edgeId = 'trigger:interaction-2:trigger-2-output';
    await expect(page.locator(`[data-id="${edgeId}"] .react-flow__edge-path`)).toBeAttached();
    await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dx).toBeGreaterThan(0);

    const target = page.getByTestId('interaction-node').filter({ hasText: 'Linked scene' });
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 700, box!.y + box!.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dx).toBeLessThan(0);
    const finalDirection = await getEdgeEndDirection(page, edgeId);
    expect(Math.abs(finalDirection.dx)).toBeGreaterThan(Math.abs(finalDirection.dy));
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
    await page.getByRole('button', { name: 'Add interaction condition' }).click();

    await expect(page.getByRole('heading', { name: 'Path conditions' })).toBeVisible();
    await expect(page.getByRole('combobox').first()).toHaveValue('interaction-2');
    await expect(page.getByRole('combobox').nth(1)).toHaveValue('visited');
  });

  test('gives a character two separate copies of one reusable item', async ({ page }) => {
    await page.route('**/api/stories/story-1/item-definitions', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({
        json: {
          itemDefinition: {
            id: 'item-definition-1',
            name: 'Archive key',
            description: '',
          },
          revision: 2,
          updatedAt: story.updatedAt,
        },
      });
    });
    await page.route('**/api/stories/story-1/characters', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({
        json: {
          character: {
            id: 'character-1',
            name: 'Mira',
            description: '',
            stats: [],
            items: [],
          },
          revision: 3,
          updatedAt: story.updatedAt,
        },
      });
    });
    let itemCount = 0;
    await page.route('**/api/stories/story-1/characters/character-1/items', async (route) => {
      itemCount += 1;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({
        itemDefinitionId: 'item-definition-1',
      });
      await route.fulfill({
        json: {
          characterId: 'character-1',
          item: {
            id: `item-${itemCount}`,
            itemDefinitionId: 'item-definition-1',
          },
          revision: 3 + itemCount,
          updatedAt: story.updatedAt,
        },
      });
    });

    await page.goto('/stories/story-1/edit');
    await page.getByRole('button', { name: 'Add item definition' }).click();
    await page.getByRole('button', { name: 'Add character' }).click();
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByRole('button', { name: 'Add item', exact: true }).click();

    const itemRows = page.locator('.item-instance-tree > li');
    await expect(itemRows).toHaveCount(2);
    await expect(itemRows.first()).toContainText('Archive key');
    await expect(itemRows.last()).toContainText('Archive key');
  });
});
