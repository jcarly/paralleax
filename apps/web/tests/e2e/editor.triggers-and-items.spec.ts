import { expect, test } from '@playwright/test';
import {
  mockStory,
  prepareEditorPage,
  story,
  storyWithConditionCandidate,
} from './editorTestHarness';

test.describe('Story editor triggers and items', () => {
  test.beforeEach(async ({ page }) => {
    await prepareEditorPage(page);
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
