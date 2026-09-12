import { expect, test, type Page, type Response } from '@playwright/test';
import {
  expectSuccessful,
  registerUser,
  waitForApiResponse,
  waitForInteractionPatch,
} from './realStackTestHarness';

const locationCount = positiveInteger(process.env.LARGE_STORY_LOCATION_COUNT, 300);
const expectedInteractionCount = locationCount * 2 - 1;

test.skip(
  process.env.RUN_LARGE_STORY_ACCEPTANCE !== 'true',
  'Run only in the scheduled or explicitly requested stress lane.',
);

test('opens, navigates, edits, reloads, and simulates a realistically sized Story', async ({
  page,
}) => {
  test.setTimeout(12 * 60_000);
  await registerUser(page, 'Large Story acceptance');

  const source = largeQspSource(locationCount);
  expect(Buffer.byteLength(source)).toBeLessThan(80 * 1024);

  await page.getByRole('button', { name: 'Import a story' }).click();
  await page.getByLabel('Source format').selectOption('qsp');
  await page.getByLabel('QSP game or location files').setInputFiles({
    name: 'scheduled-large.qsps',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });

  const importStartedAt = performance.now();
  const importRequest = waitForApiResponse(
    page,
    'POST',
    /\/api\/stories\/imports\/qsp(?:\/admin)?$/,
    4 * 60_000,
  );
  await page.getByRole('button', { name: 'Import story' }).click();
  const importResponse = await expectSuccessful(importRequest);
  const importMs = performance.now() - importStartedAt;
  const result = (await importResponse.json()) as {
    story: { id: string };
    report: { interactionCount: number };
  };
  expect(result.report.interactionCount).toBe(expectedInteractionCount);

  const dialog = page.getByRole('dialog', { name: 'QSP story imported' });
  await expect(dialog.getByText('QSP compatibility coverage')).toBeVisible();

  const stopEditorResponseTracking = trackEditorResponses(page);
  const editorStartedAt = performance.now();
  await dialog.getByRole('link', { name: 'Open in editor' }).click();
  await expect(page.locator('.story-title-input')).toHaveValue('scheduled-large');
  await expect(page.getByRole('button', { name: 'Add root' })).toBeEnabled({
    timeout: 2 * 60_000,
  });
  const editorLoadMs = performance.now() - editorStartedAt;
  const editorResponses = await stopEditorResponseTracking();

  const finalTitle = `Location ${locationCount - 1}`;
  const storySearch = page.getByRole('searchbox', {
    name: 'Search story context and interactions',
  });
  const selectionStartedAt = performance.now();
  await storySearch.fill(finalTitle);
  await page.getByRole('button', { name: 'Next interaction occurrence' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByLabel('Title')).toHaveValue(finalTitle);
  const selectionMs = performance.now() - selectionStartedAt;
  const persistedTitle = `${finalTitle} verified`;
  const titleUpdate = waitForInteractionPatch(page);
  await inspector.getByLabel('Title').fill(persistedTitle);
  await inspector.getByLabel('Title').blur();
  await expectSuccessful(titleUpdate);

  const selectedNode = page.getByTestId('interaction-node').filter({ hasText: persistedTitle });
  const selectedBox = await selectedNode.boundingBox();
  expect(selectedBox).not.toBeNull();
  const graphPositionUpdate = waitForApiResponse(
    page,
    'PATCH',
    /\/api\/stories\/[^/]+\/graph\/positions$/,
  );
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
  const graphPositionResponse = await expectSuccessful(graphPositionUpdate);
  const dragSaveMs = performance.now() - dragStartedAt;
  const graphPositionMetric = await apiResponseMetric(graphPositionResponse);

  const locationStartedAt = performance.now();
  const locationCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/locations$/);
  await page.getByRole('button', { name: 'Add location' }).click();
  const locationResponse = await expectSuccessful(locationCreation);
  await expect(inspector.getByLabel('Name')).toHaveValue('New location');
  const locationCreationMs = performance.now() - locationStartedAt;
  const locationMetric = await apiResponseMetric(locationResponse);

  const characterStartedAt = performance.now();
  const characterCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/characters$/);
  await page.getByRole('button', { name: 'Add character' }).click();
  const characterResponse = await expectSuccessful(characterCreation);
  await expect(inspector.getByLabel('Name')).toHaveValue('New character');
  const characterCreationMs = performance.now() - characterStartedAt;
  const characterMetric = await apiResponseMetric(characterResponse);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Add root' })).toBeEnabled({
    timeout: 2 * 60_000,
  });
  await page
    .getByRole('searchbox', { name: 'Search story context and interactions' })
    .fill(persistedTitle);
  await page.getByRole('button', { name: 'Next interaction occurrence' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Title'),
  ).toHaveValue(persistedTitle);

  await page
    .getByRole('searchbox', { name: 'Search story context and interactions' })
    .fill('Location 0');
  await page.getByRole('button', { name: 'Next interaction occurrence' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Title'),
  ).toHaveValue('Location 0');
  await page.getByRole('link', { name: 'Test from current interaction' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Location 0');
  await page.getByRole('button', { name: 'Continue to 1' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Continue to 1');
  await page.getByRole('button', { name: 'Location 1' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Location 1');

  console.info(
    `LARGE_STORY_ACCEPTANCE ${JSON.stringify({
      locations: locationCount,
      interactions: expectedInteractionCount,
      sourceBytes: Buffer.byteLength(source),
      importMs: Math.round(importMs),
      editorLoadMs: Math.round(editorLoadMs),
      editorRequestCount: editorResponses.length,
      editorResponseBytes: editorResponses.reduce(
        (total, measurement) => total + measurement.responseBytes,
        0,
      ),
      editorApiTotalMs: Math.round(
        editorResponses.reduce((total, measurement) => total + measurement.apiMs, 0),
      ),
      editorApiMaxMs: Math.round(
        Math.max(...editorResponses.map((measurement) => measurement.apiMs), 0),
      ),
      selectionMs: Math.round(selectionMs),
      dragSaveMs: Math.round(dragSaveMs),
      graphPositionMetric,
      locationCreationMs: Math.round(locationCreationMs),
      locationMetric,
      characterCreationMs: Math.round(characterCreationMs),
      characterMetric,
    })}`,
  );

  expect(editorLoadMs).toBeLessThan(performanceBudget('LARGE_STORY_EDITOR_BUDGET_MS', 30_000));
  expect(selectionMs).toBeLessThan(performanceBudget('LARGE_STORY_SELECTION_BUDGET_MS', 10_000));
  expect(dragSaveMs).toBeLessThan(performanceBudget('LARGE_STORY_DRAG_BUDGET_MS', 10_000));
  expect(locationCreationMs).toBeLessThan(
    performanceBudget('LARGE_STORY_CONTEXT_BUDGET_MS', 10_000),
  );
  expect(characterCreationMs).toBeLessThan(
    performanceBudget('LARGE_STORY_CONTEXT_BUDGET_MS', 10_000),
  );
});

interface ApiResponseMetric {
  path: string;
  apiMs: number;
  requestBytes: number;
  responseBytes: number;
}

function trackEditorResponses(page: Page) {
  const pendingMeasurements: Array<Promise<ApiResponseMetric>> = [];
  const listener = (response: Response) => {
    if (!new URL(response.url()).pathname.includes('/editor')) return;
    pendingMeasurements.push(apiResponseMetric(response));
  };
  page.on('response', listener);

  return async () => {
    page.off('response', listener);
    return Promise.all(pendingMeasurements);
  };
}

async function apiResponseMetric(response: Response): Promise<ApiResponseMetric> {
  await response.finished();
  const request = response.request();
  const timing = request.timing();
  return {
    path: new URL(response.url()).pathname,
    apiMs: Math.round(timing.responseEnd * 100) / 100,
    requestBytes: Buffer.byteLength(request.postData() ?? ''),
    responseBytes: (await response.body()).byteLength,
  };
}

function largeQspSource(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const name = `Location ${index}`;
    const next = index + 1;
    const action =
      next < count ? `\nact 'Continue to ${next}':\n  goto 'Location ${next}'\nend` : '';
    return `# ${name}\n'Narrative content for ${name}.'${action}\n--- ${name} ---`;
  }).join('\n\n');
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : fallback;
}

function performanceBudget(name: string, fallback: number) {
  return positiveInteger(process.env[name], fallback);
}
