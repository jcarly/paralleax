import { expect, test } from '@playwright/test';
import type {
  CharacterMutationResult,
  LocationMutationResult,
  StoryGraphPositionUpdates,
} from '@paralleax/shared';
import { createLargeEditorStoryFixture } from '../../src/test/largeEditorStoryFixture';
import { mockGraphPositionUpdates, prepareEditorPage } from '../e2e/editorTestHarness';

const interactionCount = positiveInteger(process.env.WEB_PERFORMANCE_INTERACTION_COUNT, 600);

test('measures large-Story editor loading and common interactions', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const story = createLargeEditorStoryFixture(interactionCount, { columns: 1 });
  const editorResponses: Array<{ path: string; payloadBytes: number }> = [];
  await prepareEditorPage(page, story, (metric) => editorResponses.push(metric));

  let savedGraphPositions: StoryGraphPositionUpdates | undefined;
  await mockGraphPositionUpdates(page, (updates) => {
    savedGraphPositions = updates;
  });
  await page.route('**/api/stories/story-1/locations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const result: LocationMutationResult = {
      location: {
        id: 'created-location',
        name: 'New location',
        description: '',
        imageUrl: '',
      },
      revision: 2,
      updatedAt: '2026-09-11T08:01:00.000Z',
    };
    await route.fulfill({ json: result });
  });
  await page.route('**/api/stories/story-1/characters', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const result: CharacterMutationResult = {
      character: {
        id: 'created-character',
        name: 'New character',
        description: '',
      },
      revision: 3,
      updatedAt: '2026-09-11T08:02:00.000Z',
    };
    await route.fulfill({ json: result });
  });

  const loadStartedAt = performance.now();
  await page.goto('/stories/story-1/edit');
  await expect(page.getByTestId('interaction-node').first()).toBeVisible({ timeout: 90_000 });
  const firstInteractionMs = performance.now() - loadStartedAt;
  await expect(page.getByRole('button', { name: 'Add root' })).toBeEnabled({ timeout: 90_000 });
  const editorReadyMs = performance.now() - loadStartedAt;
  const renderedNodeCount = await page.locator('.react-flow__node').count();
  const renderedEdgeCount = await page.locator('.react-flow__edge').count();

  const selectedTitle = `Interaction ${Math.floor(interactionCount / 2)}`;
  const selectionStartedAt = performance.now();
  await page
    .getByRole('searchbox', { name: 'Search story context and interactions' })
    .fill(selectedTitle);
  await page.getByRole('button', { name: 'Next interaction occurrence' }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByLabel('Title')).toHaveValue(selectedTitle);
  const selectionMs = performance.now() - selectionStartedAt;

  const selectedNode = page.locator(
    `.react-flow__node[data-id="interaction-${Math.floor(interactionCount / 2)}"]`,
  );
  const selectedBox = await selectedNode.boundingBox();
  expect(selectedBox).not.toBeNull();
  const dragStartedAt = performance.now();
  await page.mouse.move(
    selectedBox!.x + selectedBox!.width / 2,
    selectedBox!.y + selectedBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectedBox!.x + selectedBox!.width / 2 + 80,
    selectedBox!.y + selectedBox!.height / 2 + 50,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(() => savedGraphPositions).toBeDefined();
  const dragSaveMs = performance.now() - dragStartedAt;

  const locationStartedAt = performance.now();
  await page.getByRole('button', { name: 'Add location' }).click();
  await expect(inspector.getByLabel('Name')).toHaveValue('New location');
  const locationCreationMs = performance.now() - locationStartedAt;

  const characterStartedAt = performance.now();
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(inspector.getByLabel('Name')).toHaveValue('New character');
  const characterCreationMs = performance.now() - characterStartedAt;

  const measurements = {
    project: testInfo.project.name,
    interactions: interactionCount,
    editorRequestCount: editorResponses.length,
    editorRequestsByPath: countByPath(editorResponses),
    editorPayloadBytes: editorResponses.reduce(
      (total, response) => total + response.payloadBytes,
      0,
    ),
    renderedNodes: renderedNodeCount,
    renderedEdges: renderedEdgeCount,
    firstInteractionMs: round(firstInteractionMs),
    editorReadyMs: round(editorReadyMs),
    selectionMs: round(selectionMs),
    dragSaveMs: round(dragSaveMs),
    locationCreationMs: round(locationCreationMs),
    characterCreationMs: round(characterCreationMs),
  };
  console.info(`WEB_EDITOR_PERFORMANCE ${JSON.stringify(measurements)}`);

  expect(renderedNodeCount).toBeGreaterThan(0);
  expect(renderedNodeCount).toBeLessThan(interactionCount);
  expect(renderedEdgeCount).toBeLessThan(interactionCount);
  expect(firstInteractionMs).toBeLessThan(
    budget('FIRST_INTERACTION', testInfo.project.name, 15_000, 8_000),
  );
  expect(editorReadyMs).toBeLessThan(budget('EDITOR_READY', testInfo.project.name, 25_000, 12_000));
  expect(selectionMs).toBeLessThan(budget('SELECTION', testInfo.project.name, 5_000, 3_000));
  expect(dragSaveMs).toBeLessThan(budget('DRAG', testInfo.project.name, 5_000, 3_000));
  expect(locationCreationMs).toBeLessThan(
    budget('LOCATION_CREATION', testInfo.project.name, 5_000, 3_000),
  );
  expect(characterCreationMs).toBeLessThan(
    budget('CHARACTER_CREATION', testInfo.project.name, 5_000, 3_000),
  );
  expect(editorResponses.length).toBeLessThan(
    positiveInteger(process.env.WEB_PERFORMANCE_EDITOR_REQUEST_BUDGET, 50),
  );
  expect(measurements.editorPayloadBytes).toBeLessThan(
    positiveInteger(process.env.WEB_PERFORMANCE_EDITOR_PAYLOAD_BUDGET_BYTES, 5 * 1024 * 1024),
  );
});

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function budget(metric: string, project: string, development: number, production: number) {
  const environmentName = `WEB_PERFORMANCE_${metric}_${
    project === 'development' ? 'DEVELOPMENT' : 'PRODUCTION'
  }_BUDGET_MS`;
  return positiveInteger(
    process.env[environmentName],
    project === 'development' ? development : production,
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function countByPath(responses: ReadonlyArray<{ path: string }>) {
  return responses.reduce<Record<string, number>>((counts, { path }) => {
    counts[path] = (counts[path] ?? 0) + 1;
    return counts;
  }, {});
}
