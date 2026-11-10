import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  getEdgeEndDirection,
  mockGraphPositionUpdates,
  mockStory,
  prepareEditorPage,
  story,
  storyWithConditionCandidate,
  storyWithHorizontalLink,
} from './editorTestHarness';

function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to be available`);
  }

  return value;
}

type BoundingBox = { x: number; y: number; width: number; height: number };
type GraphPosition = { x: number; y: number };

function requireBoundingBox(box: BoundingBox | null, description: string): BoundingBox {
  return requireValue(box, `${description} bounding box`);
}

type InteractionCreationInput = {
  parentId?: string;
  position?: GraphPosition;
};

function isInteractionCreationInput(value: unknown): value is InteractionCreationInput {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.parentId === undefined || typeof value.parentId === 'string') &&
    (value.position === undefined || isGraphPosition(value.position))
  );
}

type DecorationCreationInput = {
  kind: 'frame' | 'text';
  position: GraphPosition;
};

function isDecorationCreationInput(value: unknown): value is DecorationCreationInput {
  if (!isRecord(value) || (value.kind !== 'frame' && value.kind !== 'text')) {
    return false;
  }

  return isGraphPosition(value.position);
}

function isGraphPosition(value: unknown): value is GraphPosition {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function expectPendingGraphSave({
  page,
  organize,
  canvas,
  pane,
  saveRequests,
}: {
  page: Page;
  organize: Locator;
  canvas: Locator;
  pane: Locator;
  saveRequests: () => number;
}): Promise<void> {
  await expect.poll(saveRequests).toBe(1);
  await expect(canvas).toHaveAttribute('aria-busy', 'true');
  await expect(organize).toBeDisabled();
  await expect(canvas).toHaveCSS('cursor', 'wait');
  await expect(pane).toHaveCSS('cursor', 'wait');
  await expect(organize).toHaveCSS('cursor', 'wait');

  const buttonBox = requireBoundingBox(await organize.boundingBox(), 'organize button');
  await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  expect(saveRequests()).toBe(1);
}

async function selectNodesWithRectangle(page: Page, nodes: Locator[]): Promise<void> {
  const boxes = await Promise.all(
    nodes.map(async (node) => requireBoundingBox(await node.boundingBox(), 'graph node')),
  );
  const left = Math.min(...boxes.map(({ x }) => x)) - 12;
  const top = Math.min(...boxes.map(({ y }) => y)) - 12;
  const right = Math.max(...boxes.map(({ x, width }) => x + width)) + 12;
  const bottom = Math.max(...boxes.map(({ y, height }) => y + height)) + 12;

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 8 });
  await page.mouse.up();
}

async function dragLocator(
  page: Page,
  locator: Locator,
  delta: { x: number; y: number },
  release = true,
): Promise<BoundingBox> {
  const box = requireBoundingBox(await locator.boundingBox(), 'drag target');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + delta.x, center.y + delta.y, { steps: 8 });
  if (release) {
    await page.mouse.up();
  }

  return box;
}

async function expectCommentsInspectorLayout(
  page: Page,
  canvas: Locator,
  viewport: Locator,
  transformBefore: string,
): Promise<void> {
  const commentsInspector = page.getByTestId('comments-inspector');
  const comments = commentsInspector.getByRole('complementary', { name: 'Story comments' });
  await expect(commentsInspector).toBeVisible();
  await expect(comments.getByText('Review this scene.')).toBeVisible();
  const inspectorBox = requireBoundingBox(
    await commentsInspector.boundingBox(),
    'comments inspector',
  );
  const canvasAfter = requireBoundingBox(await canvas.boundingBox(), 'canvas');
  expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(760);
  expect(canvasAfter.width).toBeGreaterThanOrEqual(758);
  expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(
    transformBefore,
  );

  await page.locator('.react-flow__node[data-id="interaction-1"]').click({ force: true });
  await expect(commentsInspector).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Original title');
}

async function expectGroupMovementAndClearSelection(
  page: Page,
  interactionPositions: Map<string, GraphPosition>,
): Promise<void> {
  await expect.poll(() => interactionPositions.size).toBe(2);
  const firstPosition = requireValue(
    interactionPositions.get('interaction-1'),
    'first interaction position',
  );
  const secondPosition = requireValue(
    interactionPositions.get('interaction-2'),
    'second interaction position',
  );
  expect(secondPosition.x - 120).toBeCloseTo(firstPosition.x - 120, 3);
  expect(secondPosition.y - 300).toBeCloseTo(firstPosition.y - 140, 3);

  const paneBox = requireBoundingBox(
    await page.locator('.react-flow__pane').boundingBox(),
    'canvas pane',
  );
  await page.mouse.click(paneBox.x + paneBox.width / 2, paneBox.y + 48);
  await expect(page.getByRole('heading', { name: 'Selected elements' })).toHaveCount(0);
}

async function mockDecorationCreation(page: Page): Promise<void> {
  await page.route('**/api/stories/story-1/graph-decorations', async (route) => {
    expect(route.request().method()).toBe('POST');
    const requestBody: unknown = route.request().postDataJSON();
    if (!isDecorationCreationInput(requestBody)) {
      throw new Error('Expected graph decoration creation input');
    }
    const input = requestBody;
    const decoration =
      input.kind === 'frame'
        ? {
            id: 'frame-1',
            kind: 'frame',
            position: input.position,
            color: '#5b6ee1',
            width: 420,
            height: 240,
          }
        : {
            id: 'text-1',
            kind: 'text',
            position: input.position,
            color: '#273043',
            text: 'Aa',
            fontSize: 32,
            fontFamily: 'sans',
            fontWeight: 'normal',
            fontStyle: 'normal',
          };
    await route.fulfill({
      json: { decoration, revision: 2, updatedAt: story.updatedAt },
    });
  });
}

async function mockDecorationUpdates(
  page: Page,
  patches: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route('**/api/stories/story-1/graph-decorations/*', async (route) => {
    expect(route.request().method()).toBe('PATCH');
    const requestBody: unknown = route.request().postDataJSON();
    if (!isRecord(requestBody)) {
      throw new Error('Expected a graph decoration patch object');
    }
    const patch = requestBody;
    patches.push(patch);
    const decorationId = route.request().url().split('/').at(-1);
    const decoration =
      decorationId === 'frame-1'
        ? {
            id: 'frame-1',
            kind: 'frame',
            position: { x: 0, y: 0 },
            color: '#5b6ee1',
            width: 420,
            height: 240,
            ...patch,
          }
        : {
            id: 'text-1',
            kind: 'text',
            position: { x: 0, y: 0 },
            color: '#273043',
            text: 'Aa',
            fontSize: 32,
            fontFamily: 'sans',
            fontWeight: 'normal',
            fontStyle: 'normal',
            ...patch,
          };
    await route.fulfill({
      json: { decoration, revision: 3, updatedAt: story.updatedAt },
    });
  });
}

async function addAndStyleGraphFrame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add frame' }).click();
  await expect(page.getByTestId('graph-frame-frame-1')).toBeVisible();
  const frameLayer = await page
    .getByTestId('rf__node-frame-1')
    .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  const interactionLayer = await page
    .locator('.react-flow__node-interaction')
    .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex || '0', 10));
  expect(frameLayer).toBeLessThan(interactionLayer);

  await expect(page.getByRole('heading', { name: 'Frame' })).toBeVisible();
  const frameWidth = page.getByLabel('Width');
  await expect(frameWidth).toHaveClass(/\bform-control\b/);
  await expect(frameWidth).toHaveClass(/\bform-control--compact\b/);
  await frameWidth.fill('560');
  await frameWidth.blur();
}

async function addAndStyleGraphText(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add text' }).click();
  await expect(page.getByTestId('graph-text-text-1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Text' })).toBeVisible();
  const content = page.getByLabel('Content');
  const font = page.getByLabel('Font');
  await expect(content).toHaveClass(/\bform-control--compact\b/);
  await expect(font).toHaveClass(/\bform-control--compact\b/);
  await content.fill('Opening act');
  await content.blur();
  await page.getByLabel('Text size').fill('48');
  await page.getByLabel('Text size').blur();
  await font.selectOption('serif');
  await page.getByLabel('Bold').check();
  await page.getByLabel('Italic').check();
}

async function expectGraphDecorationPatches(
  patches: Array<Record<string, unknown>>,
): Promise<void> {
  await expect.poll(() => patches).toContainEqual({ width: 560 });
  await expect.poll(() => patches).toContainEqual({ text: 'Opening act' });
  await expect.poll(() => patches).toContainEqual({ fontSize: 48 });
  await expect.poll(() => patches).toContainEqual({ fontFamily: 'serif' });
  await expect.poll(() => patches).toContainEqual({ fontWeight: 'bold' });
  await expect.poll(() => patches).toContainEqual({ fontStyle: 'italic' });
}

test.beforeEach(async ({ page }) => {
  await prepareEditorPage(page);
});

test('keeps the guide outside layout and follows the current editor target', async ({ page }) => {
  const storyWithoutScene = structuredClone(story);
  storyWithoutScene.interactions[0].body = '';
  await mockStory(page, storyWithoutScene);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'paralleax-onboarding:v1:user-1',
      JSON.stringify({
        status: 'active',
        storyId: 'story-1',
        completedSteps: [],
        skippedSteps: [],
      }),
    );
  });
  await page.goto('/stories/story-1/edit');

  await expect(page.getByRole('heading', { name: 'Explore the graph' })).toBeVisible();
  await expect(page.locator('.onboarding-guide-positioner')).toHaveCSS('position', 'fixed');
  const interaction = page.locator('.interaction-node').first();
  await expect(interaction).toHaveClass(/onboarding-target-highlight/);
  await interaction.click();

  await expect(page.getByRole('heading', { name: 'Write a scene' })).toBeVisible();
  await expect(page.locator('.inspector')).toHaveClass(/onboarding-target-highlight/);
  await expect(interaction).not.toHaveClass(/onboarding-target-highlight/);
});

test('keeps a wait cursor and prevents another organization until graph positions are saved', async ({
  page,
}) => {
  await mockStory(page, storyWithHorizontalLink());
  let saveRequests = 0;
  let releaseSave: (() => void) | undefined;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await mockGraphPositionUpdates(page, async () => {
    saveRequests += 1;
    await pendingSave;
  });

  await page.goto('/stories/story-1/edit');
  const organize = page.getByRole('button', { name: 'Organize graph', exact: true });
  const canvas = page.locator('.canvas');
  const pane = page.locator('.react-flow__pane');
  await expect(organize).toBeEnabled();
  const initialButtonCursor = await organize.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  const initialPaneCursor = await pane.evaluate((element) => getComputedStyle(element).cursor);

  try {
    await organize.click();
    await expectPendingGraphSave({
      page,
      organize,
      canvas,
      pane,
      saveRequests: () => saveRequests,
    });
  } finally {
    releaseSave?.();
  }

  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await expect(organize).toBeEnabled();
  await expect(organize).toHaveCSS('cursor', initialButtonCursor);
  await expect(pane).toHaveCSS('cursor', initialPaneCursor);
  expect(saveRequests).toBe(1);
});

test('organizes selected isolated interactions with ELK without persisting their neighbors', async ({
  page,
}) => {
  const current = storyWithHorizontalLink();
  current.interactions.push(
    {
      id: 'isolated-1',
      title: 'Isolated scene one',
      body: '',
      position: { x: 180, y: 560 },
      triggers: [{ id: 'isolated-trigger-1', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'isolated-2',
      title: 'Isolated scene two',
      body: '',
      position: { x: 680, y: 560 },
      triggers: [{ id: 'isolated-trigger-2', inputInteractionIds: [], conditions: [] }],
    },
  );
  let savedInteractionIds: string[] | undefined;
  await mockStory(page, current);
  await mockGraphPositionUpdates(page, ({ interactionUpdates }) => {
    savedInteractionIds = interactionUpdates.map(({ interactionId }) => interactionId).sort();
  });

  await page.goto('/stories/story-1/edit');
  const isolatedNodes = ['isolated-1', 'isolated-2'].map((id) =>
    page.locator(`.react-flow__node[data-id="${id}"]`),
  );
  await selectNodesWithRectangle(page, isolatedNodes);

  await expect(page.getByText('2 interactions selected')).toBeVisible();
  await page.getByRole('button', { name: 'Organize 2 selected elements' }).click();

  await expect.poll(() => savedInteractionIds).toEqual(['isolated-1', 'isolated-2']);
});

test('keeps the graph stable while the comment list opens inside the inspector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 720 });
  await page.route('**/api/stories/story-1/comment-threads', (route) =>
    route.fulfill({
      json: [
        {
          id: 'thread-1',
          storyId: 'story-1',
          anchor: {
            kind: 'entity',
            targetType: 'interaction',
            targetId: 'interaction-1',
          },
          anchorLabel: 'First scene',
          status: 'open',
          createdBy: { id: 'user-1', displayName: 'Author' },
          createdAt: '2026-09-23T08:00:00.000Z',
          updatedAt: '2026-09-23T08:00:00.000Z',
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-1',
              author: { id: 'user-1', displayName: 'Author' },
              body: 'Review this scene.',
              createdAt: '2026-09-23T08:00:00.000Z',
            },
          ],
        },
      ],
    }),
  );

  await page.goto('/stories/story-1/edit');
  const canvas = page.locator('.canvas');
  const viewport = page.locator('.react-flow__viewport');
  const transformBefore = await viewport.evaluate((element) => getComputedStyle(element).transform);

  await page.getByRole('button', { name: /^Comments/ }).click();
  await expectCommentsInspectorLayout(page, canvas, viewport, transformBefore);
});

test('keeps child creation controls clickable above invisible routing handles', async ({
  page,
}) => {
  let creationInput: { parentId?: string; position?: { x: number; y: number } } | undefined;
  await page.route('**/api/stories/story-1/interactions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const requestBody: unknown = route.request().postDataJSON();
    if (!isInteractionCreationInput(requestBody)) {
      throw new Error('Expected an interaction creation request');
    }
    creationInput = requestBody;
    await route.fulfill({
      json: {
        interaction: {
          id: 'interaction-child',
          title: 'New interaction',
          body: 'Describe what happens here.',
          position: creationInput?.position ?? { x: 120, y: 300 },
          triggers: [
            {
              id: 'trigger-child',
              inputInteractionIds: ['interaction-1'],
              conditions: [],
            },
          ],
        },
        revision: 2,
        updatedAt: '2026-07-14T08:01:00.000Z',
      },
    });
  });

  await page.goto('/stories/story-1/edit');
  const interaction = page.locator('.react-flow__node[data-id="interaction-1"]');
  const routingHandle = interaction.locator('[data-handleid="routing-output-bottom"]');
  await expect(routingHandle).not.toHaveClass(/connectionindicator/);
  await expect(routingHandle).toHaveCSS('pointer-events', 'none');
  await interaction.getByRole('button', { name: 'Create child interaction' }).click();

  await expect.poll(() => creationInput?.parentId).toBe('interaction-1');
  await expect(page.locator('.react-flow__node[data-id="interaction-child"]')).toBeVisible();
});

test('selects interactions and triggers with a rectangle and drags them as a group', async ({
  page,
}) => {
  const current = storyWithConditionCandidate();
  const interactionPositions = new Map<string, { x: number; y: number }>();
  let triggerPosition: { x: number; y: number } | undefined;
  await mockStory(page, current);
  await mockGraphPositionUpdates(page, ({ interactionUpdates, triggerUpdates }) => {
    interactionUpdates.forEach(({ interactionId, position }) =>
      interactionPositions.set(interactionId, position),
    );
    triggerPosition = triggerUpdates.find(
      ({ interactionId, triggerIds }) =>
        interactionId === 'interaction-2' && triggerIds.includes('trigger-2'),
    )?.position;
  });

  await page.goto('/stories/story-1/edit');
  const graphNodes = [
    page.locator('.react-flow__node[data-id="interaction-1"]'),
    page.locator('.react-flow__node[data-id="interaction-2"]'),
    page.locator('.react-flow__node[data-id="trigger:interaction-2:trigger-2"]'),
  ];
  await selectNodesWithRectangle(page, graphNodes);
  await expect(page.locator('.react-flow__selection')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Selected elements' })).toBeVisible();
  await expect(page.getByText('2 interactions selected')).toBeVisible();
  await expect(page.getByText('1 trigger selected')).toBeVisible();

  const draggedNode = page.locator('.react-flow__node[data-id="interaction-1"]');
  await dragLocator(page, draggedNode, { x: 90, y: 60 });

  await expect.poll(() => triggerPosition).toBeDefined();
  await expectGroupMovementAndClearSelection(page, interactionPositions);
});

test('previews trigger and arrow placement while an interaction is dragged', async ({ page }) => {
  const current = storyWithHorizontalLink();
  current.interactions[1].triggers[0].position = { x: 540, y: 240 };
  let savedTriggerPosition: { x: number; y: number } | undefined;
  await mockStory(page, current);
  await mockGraphPositionUpdates(page, ({ triggerUpdates }) => {
    savedTriggerPosition = triggerUpdates.find(
      ({ interactionId, triggerIds }) =>
        interactionId === 'interaction-2' && triggerIds.includes('trigger-2'),
    )?.position;
  });

  await page.goto('/stories/story-1/edit');
  const interaction = page.getByTestId('interaction-node').filter({ hasText: 'Linked scene' });
  const marker = page.getByTestId('flow-trigger-interaction-2-trigger-2');
  const outputPath = page.locator(
    '[data-id="trigger:interaction-2:trigger-2-output"] .react-flow__edge-path',
  );
  const markerBefore = requireBoundingBox(await marker.boundingBox(), 'trigger marker');
  const pathBefore = await outputPath.getAttribute('d');
  await dragLocator(page, interaction, { x: 120, y: 100 }, false);

  await expect
    .poll(async () => {
      const currentBox = await marker.boundingBox();
      return currentBox ? { x: Math.round(currentBox.x), y: Math.round(currentBox.y) } : null;
    })
    .not.toEqual({ x: Math.round(markerBefore.x), y: Math.round(markerBefore.y) });
  await expect.poll(() => outputPath.getAttribute('d')).not.toBe(pathBefore);
  const markerDuring = requireBoundingBox(await marker.boundingBox(), 'dragged trigger marker');
  const pathDuring = await outputPath.getAttribute('d');
  expect(pathDuring).not.toBeNull();

  await page.mouse.up();

  await expect.poll(() => savedTriggerPosition).toBeDefined();
  await expect
    .poll(async () => {
      const currentBox = await marker.boundingBox();
      return currentBox ? { x: Math.round(currentBox.x), y: Math.round(currentBox.y) } : null;
    })
    .toEqual({ x: Math.round(markerDuring.x), y: Math.round(markerDuring.y) });
  await expect.poll(() => outputPath.getAttribute('d')).toBe(pathDuring);
});

test('pans the graph with the middle button or Space plus primary drag', async ({ page }) => {
  await page.goto('/stories/story-1/edit');
  const pane = page.locator('.react-flow__pane');
  const viewport = page.locator('.react-flow__viewport');
  const bounds = requireBoundingBox(await pane.boundingBox(), 'canvas pane');
  const start = { x: bounds.x + bounds.width - 90, y: bounds.y + bounds.height - 90 };
  const transform = () => viewport.evaluate((element) => getComputedStyle(element).transform);

  const initial = await transform();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 70, start.y - 40, { steps: 5 });
  await page.mouse.up();
  expect(await transform()).toBe(initial);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x - 70, start.y - 40, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const afterMiddleDrag = await transform();
  expect(afterMiddleDrag).not.toBe(initial);

  await page.keyboard.down('Space');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await transform()).not.toBe(afterMiddleDrag);
});

test('drags and saves a linked trigger marker', async ({ page }) => {
  const current = storyWithHorizontalLink();
  await mockStory(page, current);
  let savedPosition: { x: number; y: number } | undefined;

  await mockGraphPositionUpdates(page, ({ interactionUpdates, triggerUpdates }) => {
    expect(interactionUpdates).toEqual([]);
    const update = triggerUpdates.find(
      ({ interactionId, triggerIds }) =>
        interactionId === 'interaction-2' && triggerIds.includes('trigger-2'),
    );
    savedPosition = update?.position;
  });

  await page.goto('/stories/story-1/edit');
  const marker = page.getByTestId('flow-trigger-interaction-2-trigger-2');
  await dragLocator(page, marker, { x: 100, y: 60 });

  await expect.poll(() => savedPosition?.x).toBeGreaterThan(495);
  await expect(marker).toBeVisible();
});

test('adds and styles visual frames and text behind narrative nodes', async ({ page }) => {
  const patches: Array<Record<string, unknown>> = [];
  await mockDecorationCreation(page);
  await mockDecorationUpdates(page, patches);

  await page.goto('/stories/story-1/edit');
  await addAndStyleGraphFrame(page);
  await addAndStyleGraphText(page);
  await expectGraphDecorationPatches(patches);
});

test('keeps the incoming arrow attached to the interaction top across a move', async ({ page }) => {
  const current = storyWithHorizontalLink();
  await mockStory(page, current);

  await page.goto('/stories/story-1/edit');
  const edgeId = 'trigger:interaction-2:trigger-2-output';
  await expect(page.locator(`[data-id="${edgeId}"] .react-flow__edge-path`)).toBeAttached();
  await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dy).toBeGreaterThan(0);
  const initialDirection = await getEdgeEndDirection(page, edgeId);
  expect(Math.abs(initialDirection.dy)).toBeGreaterThan(Math.abs(initialDirection.dx));

  const target = page.getByTestId('interaction-node').filter({ hasText: 'Linked scene' });
  await dragLocator(page, target, { x: -700, y: 0 });

  await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dy).toBeGreaterThan(0);
  const finalDirection = await getEdgeEndDirection(page, edgeId);
  expect(Math.abs(finalDirection.dy)).toBeGreaterThan(Math.abs(finalDirection.dx));
});
