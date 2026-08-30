import { expect, test } from '@playwright/test';
import {
  cloneStory,
  mockGraphPositionUpdates,
  mockStory,
  prepareEditorPage,
  storyWithConditionCandidate,
} from './editorTestHarness';

test.describe('Story editor persistence', () => {
  test.beforeEach(async ({ page }) => {
    await prepareEditorPage(page);
  });

  test('applies a remote story invalidation without reloading the editor', async ({ page }) => {
    let current = cloneStory();
    await page.route('**/api/stories/story-1', (route) =>
      route.fulfill({ json: structuredClone(current) }),
    );

    await page.goto('/stories/story-1/edit');
    await expect(page.getByText('Collaborative editing live')).toBeVisible();
    await expect(page.getByTestId('interaction-node')).toContainText('Original title');

    current = structuredClone(current);
    current.revision = 2;
    current.interactions[0].title = 'Changed by another editor';
    current.interactions[0].position = { x: 480, y: 320 };
    current.locations = [
      { id: 'remote-location', name: 'Remote location', description: 'Created elsewhere' },
    ];
    await page.evaluate(() => {
      (
        window as typeof window & {
          storyEvents?: Array<{ url: string; emit: (type: string) => void }>;
        }
      ).storyEvents
        ?.find(({ url }) => url === '/api/stories/story-1/events')
        ?.emit('story-changed');
    });

    await expect(page.getByTestId('interaction-node')).toContainText('Changed by another editor');
    await expect(page.getByText('Remote location')).toBeVisible();
    await expect(page).toHaveURL('/stories/story-1/edit');
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

  test('undoes a persisted Story change and keeps the restored state after reload', async ({
    page,
  }) => {
    let current = cloneStory();
    current.revision = 2;
    current.title = 'Changed story title';
    let history = {
      entries: [
        {
          id: '1',
          revision: 2,
          kind: 'change',
          operation: 'story.updated',
          createdAt: '2026-08-28T08:01:00.000Z',
          reverted: false,
        },
      ],
      canUndo: true,
      canRedo: false,
    };
    await page.route('**/api/stories/story-1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: structuredClone(current) });
      }
      return route.fallback();
    });
    await page.route('**/api/stories/story-1/history', (route) =>
      route.fulfill({ json: structuredClone(history) }),
    );
    await page.route('**/api/stories/story-1/history/undo', (route) => {
      current = cloneStory();
      current.revision = 3;
      history = {
        entries: [],
        canUndo: false,
        canRedo: true,
      };
      return route.fulfill({ json: { story: structuredClone(current), history } });
    });

    await page.goto('/stories/story-1/edit');
    const undo = page.getByRole('button', { name: 'Undo last Story change' });
    await expect(undo).toBeEnabled();
    await undo.click();

    await expect(page.locator('.story-title-input')).toHaveValue('Test story');
    await expect(page.getByRole('button', { name: 'Redo Story change' })).toBeEnabled();
    await page.reload();
    await expect(page.locator('.story-title-input')).toHaveValue('Test story');
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

  test('wraps selected text in a structured conditional frame and preserves it on removal', async ({
    page,
  }) => {
    const current = storyWithConditionCandidate();
    const patches: Array<Record<string, unknown>> = [];
    await mockStory(page, current);
    await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
      const patch = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(patch);
      const interaction = { ...current.interactions[0], ...patch };
      await route.fulfill({
        json: {
          interaction,
          revision: patches.length + 1,
          updatedAt: '2026-08-30T12:00:00.000Z',
        },
      });
    });

    await page.goto('/stories/story-1/edit');
    await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
    const content = page.getByRole('textbox', { name: 'Content' });
    await content.evaluate((element) => {
      element.focus();
      const text = element.firstChild;
      if (!text) throw new Error('Expected interaction body text');
      const range = document.createRange();
      range.setStart(text, 9);
      range.setEnd(text, 16);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await page.getByRole('button', { name: 'Add conditional text' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a condition' });
    await dialog.getByRole('button', { name: 'Interaction' }).click();
    await dialog.getByRole('button', { name: 'Insert' }).click();

    await expect
      .poll(() => patches.find((patch) => 'conditionalTextBlocks' in patch))
      .toMatchObject({
        body: expect.stringMatching(
          /^Original <span data-conditional-text-block="[^"]+">content<\/span>$/,
        ),
        conditionalTextBlocks: [
          {
            id: expect.any(String),
            conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
          },
        ],
      });
    await expect(page.getByRole('button', { name: 'Edit condition' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove condition' }).click();
    await expect
      .poll(() => patches.at(-1))
      .toMatchObject({
        body: 'Original content',
        conditionalTextBlocks: [],
      });
    await expect(content).toHaveText('Original content');
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
    await mockGraphPositionUpdates(page, ({ interactionUpdates, triggerUpdates }) => {
      expect(interactionUpdates).toHaveLength(1);
      expect(interactionUpdates[0]).toMatchObject({ interactionId: 'interaction-1' });
      expect(triggerUpdates).toEqual([]);
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
