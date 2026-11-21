import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  editInteraction,
  expectSuccessful,
  interactionNode,
  openInteractionTitleEditor,
  registerAndCreateStory,
  waitForInteractionPatch,
} from './realStackTestHarness';

test('exports a Story and imports an editable, playable copy', async ({ page }) => {
  const { storyId, storyTitle } = await registerAndCreateStory(page, 'Native transfer');
  await editInteraction(page, 'Start', 'Opening', 'A door opens.');
  await editInteraction(page, 'New interaction', 'Ending', 'The story ends.');
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  const card = page.locator('.library-card').filter({ hasText: storyTitle });
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('link', { name: 'Export' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) {
    throw new Error('The export did not produce a file');
  }
  expect(download.suggestedFilename()).toMatch(/\.paralleax\.json$/);
  const buffer = await readFile(path);

  await page.getByRole('button', { name: 'Import a story' }).click();
  await page.getByLabel('Source format').selectOption('native');
  const dialog = page.getByRole('dialog', { name: 'Import a Paralleax Story' });
  await dialog.getByLabel('Story JSON file').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer,
  });
  await expect(dialog.getByText(storyTitle, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import story' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Import story' }).click();
  await expect(page).toHaveURL(/\/stories\/[^/]+\/edit/);
  expect(page.url()).not.toContain(`/stories/${storyId}/edit`);
  await expect(page.locator('.story-title-input')).toHaveValue(storyTitle);
  await expect(interactionNode(page, 'Opening')).toBeVisible();
  await expect(interactionNode(page, 'Ending')).toBeVisible();
  await interactionNode(page, 'Opening').click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const title = await openInteractionTitleEditor(inspector, 'Opening');
  const update = waitForInteractionPatch(page);
  await title.fill('Opening edited');
  await title.blur();
  await expectSuccessful(update);
  await page.getByRole('link', { name: 'Test from start' }).click();
  await page.getByRole('button', { name: 'Opening edited', exact: true }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Opening edited');
  await page.getByRole('button', { name: 'Ending', exact: true }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Ending');
});
