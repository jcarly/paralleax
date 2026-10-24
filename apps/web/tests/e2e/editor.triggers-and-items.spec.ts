import { expect, test } from '@playwright/test';
import {
  mockStory,
  prepareEditorPage,
  story,
  storyWithConditionCandidate,
  storyWithHorizontalLink,
} from './editorTestHarness';

test.describe('Story editor triggers and items', () => {
  test.beforeEach(async ({ page }) => {
    await prepareEditorPage(page);
  });

  test('keeps root and linked trigger marker geometry stable across interaction states', async ({
    page,
  }) => {
    await mockStory(page, storyWithHorizontalLink());
    await page.goto('/stories/story-1/edit');
    const rootMarker = page
      .getByTestId('interaction-node')
      .filter({ hasText: 'Original title' })
      .getByRole('button', { name: 'Select root trigger' });
    const linkedMarker = page.getByTestId('flow-trigger-interaction-2-trigger-2');

    for (const marker of [rootMarker, linkedMarker]) {
      const geometry = () =>
        marker.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return {
            transform: getComputedStyle(element).transform,
            bounds: { x, y, width, height },
          };
        });

      const atRest = await geometry();
      await marker.hover();
      await expect.poll(geometry).toEqual(atRest);

      await page.mouse.move(0, 0);
      await marker.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(marker).toBeFocused();
      await expect
        .poll(() => marker.evaluate((element) => element.matches(':focus-visible')))
        .toBe(true);
      await expectKeyboardFocusRing(marker);
      await expect.poll(geometry).toEqual(atRest);

      await marker.click();
      await expect(marker).toHaveClass(/selected/);
      await expect.poll(geometry).toEqual(atRest);
    }

    const createChild = page.locator('.node-create-child');
    const createChildGeometry = await createChild.boundingBox();
    await createChild.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(createChild).toBeFocused();
    await expect
      .poll(() => createChild.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    await expectKeyboardFocusRing(createChild);
    expect(await createChild.boundingBox()).toEqual(createChildGeometry);
  });

  test('edits root trigger path conditions from the root trigger marker', async ({ page }) => {
    const initialStory = storyWithConditionCandidate();
    await mockStory(page, initialStory);
    const updated = structuredClone(initialStory);
    updated.interactions[0].triggers[0].conditionGroups = [
      {
        id: 'trigger-1',
        conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
      },
    ];
    delete updated.interactions[0].triggers[0].conditions;

    await page.route(
      '**/api/stories/story-1/interactions/interaction-1/triggers/trigger-1',
      async (route) => {
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().postDataJSON()).toEqual({
          conditionGroups: [
            {
              id: 'trigger-1',
              conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
            },
          ],
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
    const conditionTypePicker = page.getByRole('group', { name: 'Condition type' });
    await conditionTypePicker.getByRole('button', { name: 'Location' }).hover();
    await expect(
      page.getByRole('tooltip', {
        name: 'Create a location before using this condition type.',
      }),
    ).toBeVisible();
    await conditionTypePicker.getByRole('button', { name: 'Interaction' }).click();

    await expect(page.getByRole('heading', { name: 'Path conditions' })).toBeVisible();
    await expect(page.getByLabel('Condition interaction')).toHaveValue('interaction-2');
    await expect(page.getByLabel('Interaction condition operator')).toHaveValue('visited');
  });

  test('deletes one OR group without confirmation and keeps the inspector open', async ({
    page,
  }) => {
    const initialStory = storyWithConditionCandidate();
    initialStory.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditionGroups: [
          {
            id: 'group-a',
            conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
          },
          {
            id: 'group-b',
            conditions: [{ interactionId: 'interaction-1', hasBeenVisited: false }],
          },
        ],
      },
    ];
    await mockStory(page, initialStory);
    const afterDelete = structuredClone(initialStory);
    afterDelete.interactions[1].triggers[0].conditionGroups = [
      afterDelete.interactions[1].triggers[0].conditionGroups![1],
    ];
    await page.route(
      '**/api/stories/story-1/interactions/interaction-2/triggers/trigger-a',
      async (route) => {
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().postDataJSON()).toEqual({
          conditionGroups: [
            {
              id: 'group-b',
              conditions: [{ interactionId: 'interaction-1', hasBeenVisited: false }],
            },
          ],
        });
        await route.fulfill({ json: afterDelete });
      },
    );
    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      dialogCount += 1;
      await dialog.dismiss();
    });

    await page.goto('/stories/story-1/edit');
    await page.getByTestId('flow-trigger-interaction-2-trigger-a').click();
    await expect(page.getByText('OR', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete this OR group' }).first().click();

    await expect(page.getByRole('heading', { name: 'Path conditions' })).toBeVisible();
    await expect(page.getByTestId('flow-trigger-interaction-2-trigger-a')).toHaveClass(/selected/);
    expect(dialogCount).toBe(0);
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

async function expectKeyboardFocusRing(locator: import('@playwright/test').Locator) {
  await expect
    .poll(() => locator.evaluate((element) => getComputedStyle(element).boxShadow))
    .toContain('rgb(47, 98, 80)');
  const ring = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
  });
  expect(ring.outlineColor).toBe('rgb(255, 255, 255)');
  expect(ring.outlineStyle).toBe('solid');
  expect(ring.boxShadow).toContain('rgb(47, 98, 80)');
  const background = parseColor(ring.backgroundColor);
  expect(
    Math.max(
      contrastRatio(parseColor(ring.outlineColor), background),
      contrastRatio([47, 98, 80], background),
    ),
  ).toBeGreaterThanOrEqual(3);
}

function parseColor(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Expected an RGB color, got ${value}`);
  return [channels[0], channels[1], channels[2]];
}

function contrastRatio(first: [number, number, number], second: [number, number, number]) {
  const luminance = (color: [number, number, number]) => {
    const linear = color.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
