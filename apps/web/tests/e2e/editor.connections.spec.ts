import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Interaction, Story, Trigger } from '@paralleax/shared';
import { cloneStory, prepareEditorPage } from './editorTestHarness';

type Point = { x: number; y: number };

function storyWithUnlinkedScenes(): Story {
  const next = cloneStory();
  next.interactions.push({
    id: 'interaction-2',
    title: 'Second scene',
    body: 'Not linked yet.',
    position: { x: 520, y: 380 },
    triggers: [{ id: 'trigger-2', inputInteractionIds: [], conditions: [] }],
  });
  return next;
}

function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  if (!box) {
    throw new Error('Expected a bounding box');
  }
  return box;
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = requireBox(await locator.boundingBox());
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with real pointer events so React Flow's own connection gesture runs. */
async function dragPointer(page: Page, from: Locator, to: Point) {
  const start = await centerOf(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

type MockStoryServer = {
  story: Story;
  nextInteraction: number;
  nextTrigger: number;
  revision: number;
};

type CreationInput = { parentId?: string; position?: Point };
type TriggerInput = Pick<Trigger, 'inputInteractionIds'> & Partial<Pick<Trigger, 'conditions'>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCreationInput(value: unknown): value is CreationInput {
  return isRecord(value) && (value.parentId === undefined || typeof value.parentId === 'string');
}

function isTriggerInput(value: unknown): value is TriggerInput {
  return isRecord(value) && Array.isArray(value.inputInteractionIds);
}

function mutationMetadata(server: MockStoryServer) {
  server.revision += 1;
  return { revision: server.revision, updatedAt: '2026-07-14T08:01:00.000Z' };
}

function createdInteraction(server: MockStoryServer, input: CreationInput): Interaction {
  const id = `interaction-new-${String(server.nextInteraction++)}`;
  const parentIds = input.parentId === undefined ? [] : [input.parentId];
  return {
    id,
    title: 'New interaction',
    body: '',
    position: input.position ?? { x: 120, y: 600 },
    triggers: [{ id: `trigger-${id}`, inputInteractionIds: parentIds, conditions: [] }],
  };
}

function withSavedTrigger(story: Story, interactionId: string, trigger: Trigger, isNew: boolean) {
  return {
    ...story,
    interactions: story.interactions.map((interaction) => {
      if (interaction.id !== interactionId) {
        return interaction;
      }
      const triggers = isNew
        ? [...interaction.triggers, trigger]
        : interaction.triggers.map((item) => (item.id === trigger.id ? trigger : item));
      return { ...interaction, triggers };
    }),
  };
}

/** Minimal in-memory story server for the creation and trigger mutations used by drops. */
async function serveStoryMutations(page: Page, server: MockStoryServer) {
  await page.route('**/api/stories/story-1/interactions', async (route) => {
    const input: unknown = route.request().postDataJSON();
    if (route.request().method() !== 'POST' || !isCreationInput(input)) {
      await route.fallback();
      return;
    }
    const interaction = createdInteraction(server, input);
    server.story = { ...server.story, interactions: [...server.story.interactions, interaction] };
    await route.fulfill({ json: { interaction, ...mutationMetadata(server) } });
  });
  await page.route('**/api/stories/story-1/interactions/*/triggers**', async (route) => {
    const input: unknown = route.request().postDataJSON();
    const path = new URL(route.request().url()).pathname;
    const match = /interactions\/([^/]+)\/triggers(?:\/([^/?]+))?/.exec(path);
    if (!match || !isTriggerInput(input)) {
      await route.fallback();
      return;
    }
    const [, interactionId = '', existingTriggerId = ''] = match;
    const isNew = route.request().method() === 'POST';
    const id = isNew ? `trigger-new-${String(server.nextTrigger++)}` : existingTriggerId;
    const trigger: Trigger = { conditions: [], ...input, id };
    server.story = withSavedTrigger(server.story, interactionId, trigger, isNew);
    await route.fulfill({ json: { interactionId, trigger, ...mutationMetadata(server) } });
  });
}

const flowNode = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const childHandle = (page: Page, id: string) =>
  flowNode(page, id).getByRole('button', { name: 'Create child interaction' });
const parentHandle = (page: Page, id: string) =>
  flowNode(page, id).locator('[data-handleid="create-source-input"]');

function inputsOf(story: Story, interactionId: string) {
  return story.interactions
    .find((interaction) => interaction.id === interactionId)
    ?.triggers.flatMap((trigger) => trigger.inputInteractionIds);
}

function storyWithLinkedTrigger(): Story {
  const next = storyWithUnlinkedScenes();
  next.interactions.push({
    id: 'interaction-3',
    title: 'Third scene',
    body: 'Leads to the second scene.',
    position: { x: 520, y: 140 },
    triggers: [{ id: 'trigger-3', inputInteractionIds: [], conditions: [] }],
  });
  next.interactions = next.interactions.map((interaction) =>
    interaction.id === 'interaction-2'
      ? {
          ...interaction,
          triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-3'], conditions: [] }],
        }
      : interaction,
  );
  return next;
}

function triggerInputsOf(story: Story, interactionId: string) {
  return story.interactions
    .find((interaction) => interaction.id === interactionId)
    ?.triggers.map(({ id, inputInteractionIds }) => ({ id, inputInteractionIds }));
}

async function openEditor(page: Page, initialStory: Story = storyWithUnlinkedScenes()) {
  const state: MockStoryServer = {
    story: initialStory,
    nextInteraction: 1,
    nextTrigger: 1,
    revision: 1,
  };
  await prepareEditorPage(page, () => state.story);
  await serveStoryMutations(page, state);
  await page.goto('/stories/story-1/edit');
  await expect(flowNode(page, 'interaction-2')).toBeVisible();
  return state;
}

test('drags from an initial interaction output onto the canvas to create a child', async ({
  page,
}) => {
  const state = await openEditor(page);
  const box = requireBox(await flowNode(page, 'interaction-1').boundingBox());

  await dragPointer(page, childHandle(page, 'interaction-1'), {
    x: box.x + 40,
    y: box.y + box.height + 220,
  });

  await expect(flowNode(page, 'interaction-new-1')).toBeVisible();
  expect(inputsOf(state.story, 'interaction-new-1')).toEqual(['interaction-1']);
});

test('drags from an initial interaction input onto the canvas to create a parent', async ({
  page,
}) => {
  const state = await openEditor(page);
  const box = requireBox(await flowNode(page, 'interaction-2').boundingBox());

  await dragPointer(page, parentHandle(page, 'interaction-2'), {
    x: box.x + box.width + 200,
    y: box.y - 120,
  });

  await expect(flowNode(page, 'interaction-new-1')).toBeVisible();
  await expect.poll(() => inputsOf(state.story, 'interaction-2')).toContain('interaction-new-1');
});

test('links initial interactions by drag, repeatably and persistently after reload', async ({
  page,
}) => {
  const state = await openEditor(page);

  await dragPointer(
    page,
    childHandle(page, 'interaction-1'),
    await centerOf(parentHandle(page, 'interaction-2')),
  );
  await expect.poll(() => inputsOf(state.story, 'interaction-2')).toContain('interaction-1');

  await page.reload();
  await expect(flowNode(page, 'interaction-2')).toBeVisible();
  const reloadedTriggers = state.story.interactions.find(
    ({ id }) => id === 'interaction-2',
  )?.triggers;
  const linkedTrigger = reloadedTriggers?.find(({ inputInteractionIds }) =>
    inputInteractionIds.includes('interaction-1'),
  );
  await expect(
    page.locator(`.react-flow__edge[data-id*="${linkedTrigger?.id ?? 'missing'}"]`).first(),
  ).toBeAttached();

  const box = requireBox(await flowNode(page, 'interaction-1').boundingBox());
  await dragPointer(page, childHandle(page, 'interaction-1'), {
    x: box.x - 180,
    y: box.y + box.height + 120,
  });
  await expect(flowNode(page, 'interaction-new-1')).toBeVisible();
});

test('drags from an initial interaction output onto an existing root trigger marker', async ({
  page,
}) => {
  const state = await openEditor(page);
  const marker = flowNode(page, 'interaction-2').locator(
    '.root-trigger-marker[data-trigger-id="trigger-2"]',
  );

  await dragPointer(page, childHandle(page, 'interaction-1'), await centerOf(marker));

  await expect
    .poll(() => triggerInputsOf(state.story, 'interaction-2'))
    .toEqual([{ id: 'trigger-2', inputInteractionIds: ['interaction-1'] }]);
  await expect(page.locator('.react-flow__node[data-id^="interaction-new"]')).toHaveCount(0);
});

test('drags from an initial interaction output onto an existing trigger node', async ({ page }) => {
  const state = await openEditor(page, storyWithLinkedTrigger());
  const marker = page.getByTestId('flow-trigger-interaction-2-trigger-2');
  await expect(marker).toBeVisible();

  await dragPointer(page, childHandle(page, 'interaction-1'), await centerOf(marker));

  await expect
    .poll(() => triggerInputsOf(state.story, 'interaction-2'))
    .toEqual([{ id: 'trigger-2', inputInteractionIds: ['interaction-3', 'interaction-1'] }]);
  await expect(page.locator('.react-flow__node[data-id^="interaction-new"]')).toHaveCount(0);
});
