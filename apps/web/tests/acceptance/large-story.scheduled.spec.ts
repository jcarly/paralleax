import { expect, test } from '@playwright/test';
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

  const editorStartedAt = performance.now();
  await dialog.getByRole('link', { name: 'Open in editor' }).click();
  await expect(page.locator('.story-title-input')).toHaveValue('scheduled-large');
  await expect(page.getByTestId('interaction-node')).toHaveCount(expectedInteractionCount, {
    timeout: 2 * 60_000,
  });
  const editorLoadMs = performance.now() - editorStartedAt;

  const finalTitle = `Location ${locationCount - 1}`;
  const storySearch = page.getByRole('searchbox', {
    name: 'Search story context and interactions',
  });
  await storySearch.fill(finalTitle);
  await page.getByRole('button', { name: 'Next interaction occurrence' }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByLabel('Title')).toHaveValue(finalTitle);
  const persistedTitle = `${finalTitle} verified`;
  const titleUpdate = waitForInteractionPatch(page);
  await inspector.getByLabel('Title').fill(persistedTitle);
  await inspector.getByLabel('Title').blur();
  await expectSuccessful(titleUpdate);

  await page.reload();
  await expect(page.getByTestId('interaction-node')).toHaveCount(expectedInteractionCount, {
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
    })}`,
  );
});

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
