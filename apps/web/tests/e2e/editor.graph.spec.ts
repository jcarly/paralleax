import { expect, test } from '@playwright/test';
import {
  getEdgeEndDirection,
  mockGraphPositionUpdates,
  mockStory,
  prepareEditorPage,
  story,
  storyWithConditionCandidate,
  storyWithHorizontalLink,
} from './editorTestHarness';

test.describe('Story editor graph', () => {
  test.beforeEach(async ({ page }) => {
    await prepareEditorPage(page);
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
    const boxes = await Promise.all(graphNodes.map((node) => node.boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    const left = Math.min(...boxes.map((box) => box!.x)) - 12;
    const top = Math.min(...boxes.map((box) => box!.y)) - 12;
    const right = Math.max(...boxes.map((box) => box!.x + box!.width)) + 12;
    const bottom = Math.max(...boxes.map((box) => box!.y + box!.height)) + 12;

    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(right, bottom, { steps: 8 });
    await expect(page.locator('.react-flow__selection')).toBeVisible();
    await page.mouse.up();

    await expect(page.getByRole('heading', { name: 'Selected elements' })).toBeVisible();
    await expect(page.getByText('2 interactions selected')).toBeVisible();
    await expect(page.getByText('1 trigger selected')).toBeVisible();

    const draggedNode = page.locator('.react-flow__node[data-id="interaction-1"]');
    const draggedBox = await draggedNode.boundingBox();
    expect(draggedBox).not.toBeNull();
    await page.mouse.move(
      draggedBox!.x + draggedBox!.width / 2,
      draggedBox!.y + draggedBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      draggedBox!.x + draggedBox!.width / 2 + 90,
      draggedBox!.y + draggedBox!.height / 2 + 60,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect.poll(() => interactionPositions.size).toBe(2);
    await expect.poll(() => triggerPosition).toBeDefined();
    const firstDelta = {
      x: interactionPositions.get('interaction-1')!.x - 120,
      y: interactionPositions.get('interaction-1')!.y - 140,
    };
    const secondDelta = {
      x: interactionPositions.get('interaction-2')!.x - 120,
      y: interactionPositions.get('interaction-2')!.y - 300,
    };
    expect(secondDelta.x).toBeCloseTo(firstDelta.x, 3);
    expect(secondDelta.y).toBeCloseTo(firstDelta.y, 3);

    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    await page.mouse.click(paneBox!.x + paneBox!.width / 2, paneBox!.y + 48);
    await expect(page.getByRole('heading', { name: 'Selected elements' })).toHaveCount(0);
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
    const interactionBox = await interaction.boundingBox();
    const markerBefore = await marker.boundingBox();
    const pathBefore = await outputPath.getAttribute('d');
    expect(interactionBox).not.toBeNull();
    expect(markerBefore).not.toBeNull();

    await page.mouse.move(
      interactionBox!.x + interactionBox!.width / 2,
      interactionBox!.y + interactionBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      interactionBox!.x + interactionBox!.width / 2 + 120,
      interactionBox!.y + interactionBox!.height / 2 + 100,
      { steps: 8 },
    );

    await expect
      .poll(async () => {
        const currentBox = await marker.boundingBox();
        return currentBox ? { x: Math.round(currentBox.x), y: Math.round(currentBox.y) } : null;
      })
      .not.toEqual({ x: Math.round(markerBefore!.x), y: Math.round(markerBefore!.y) });
    await expect.poll(() => outputPath.getAttribute('d')).not.toBe(pathBefore);
    const markerDuring = await marker.boundingBox();
    const pathDuring = await outputPath.getAttribute('d');
    expect(markerDuring).not.toBeNull();
    expect(pathDuring).not.toBeNull();

    await page.mouse.up();

    await expect.poll(() => savedTriggerPosition).toBeDefined();
    await expect
      .poll(async () => {
        const currentBox = await marker.boundingBox();
        return currentBox ? { x: Math.round(currentBox.x), y: Math.round(currentBox.y) } : null;
      })
      .toEqual({ x: Math.round(markerDuring!.x), y: Math.round(markerDuring!.y) });
    await expect.poll(() => outputPath.getAttribute('d')).toBe(pathDuring);
  });

  test('pans the graph with the middle button or Space plus primary drag', async ({ page }) => {
    await page.goto('/stories/story-1/edit');
    const pane = page.locator('.react-flow__pane');
    const viewport = page.locator('.react-flow__viewport');
    const bounds = await pane.boundingBox();
    expect(bounds).not.toBeNull();
    const start = { x: bounds!.x + bounds!.width - 90, y: bounds!.y + bounds!.height - 90 };
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

  test('adds and styles visual frames and text behind narrative nodes', async ({ page }) => {
    const patches: Array<Record<string, unknown>> = [];

    await page.route('**/api/stories/story-1/graph-decorations', async (route) => {
      expect(route.request().method()).toBe('POST');
      const input = route.request().postDataJSON() as {
        kind: 'frame' | 'text';
        position: { x: number; y: number };
      };
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
    await page.route('**/api/stories/story-1/graph-decorations/*', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      const patch = route.request().postDataJSON() as Record<string, unknown>;
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

    await page.goto('/stories/story-1/edit');
    await page.getByRole('button', { name: 'Add frame' }).click();
    const frame = page.getByTestId('graph-frame-frame-1');
    await expect(frame).toBeVisible();
    const frameLayer = await page
      .getByTestId('rf__node-frame-1')
      .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
    const interactionLayer = await page
      .locator('.react-flow__node-interaction')
      .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex || '0', 10));
    expect(frameLayer).toBeLessThan(interactionLayer);

    await expect(page.getByRole('heading', { name: 'Frame' })).toBeVisible();
    await page.getByLabel('Width').fill('560');
    await page.getByLabel('Width').blur();

    await page.getByRole('button', { name: 'Add text' }).click();
    const text = page.getByTestId('graph-text-text-1');
    await expect(text).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Text' })).toBeVisible();
    await page.getByLabel('Content').fill('Opening act');
    await page.getByLabel('Content').blur();
    await page.getByLabel('Text size').fill('48');
    await page.getByLabel('Text size').blur();
    await page.getByLabel('Font').selectOption('serif');
    await page.getByLabel('Bold').check();
    await page.getByLabel('Italic').check();

    await expect.poll(() => patches).toContainEqual({ width: 560 });
    await expect.poll(() => patches).toContainEqual({ text: 'Opening act' });
    await expect.poll(() => patches).toContainEqual({ fontSize: 48 });
    await expect.poll(() => patches).toContainEqual({ fontFamily: 'serif' });
    await expect.poll(() => patches).toContainEqual({ fontWeight: 'bold' });
    await expect.poll(() => patches).toContainEqual({ fontStyle: 'italic' });
  });

  test('keeps the incoming arrow attached to the interaction top across a move', async ({
    page,
  }) => {
    const current = storyWithHorizontalLink();
    await mockStory(page, current);

    await page.goto('/stories/story-1/edit');
    const edgeId = 'trigger:interaction-2:trigger-2-output';
    await expect(page.locator(`[data-id="${edgeId}"] .react-flow__edge-path`)).toBeAttached();
    await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dy).toBeGreaterThan(0);
    const initialDirection = await getEdgeEndDirection(page, edgeId);
    expect(Math.abs(initialDirection.dy)).toBeGreaterThan(Math.abs(initialDirection.dx));

    const target = page.getByTestId('interaction-node').filter({ hasText: 'Linked scene' });
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 700, box!.y + box!.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect.poll(async () => (await getEdgeEndDirection(page, edgeId)).dy).toBeGreaterThan(0);
    const finalDirection = await getEdgeEndDirection(page, edgeId);
    expect(Math.abs(finalDirection.dy)).toBeGreaterThan(Math.abs(finalDirection.dx));
  });
});
