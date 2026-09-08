import { expect, test } from '@playwright/test';
import {
  createdInteraction,
  editInteraction,
  expectSuccessful,
  interactionNode,
  registerAndCreateStory,
  waitForApiResponse,
} from './realStackTestHarness';

test('reader, simulation, and manual save slots resume independently', async ({ page }) => {
  test.setTimeout(420_000);
  const { storyId } = await registerAndCreateStory(page, 'Save slots');

  const rootCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await page.getByRole('button', { name: 'Add root' }).click();
  await createdInteraction(rootCreation);
  await editInteraction(page, 'New interaction', 'Opening', 'The journey starts.');

  const childCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await interactionNode(page, 'Opening')
    .getByRole('button', { name: 'Create child interaction' })
    .click();
  await createdInteraction(childCreation);
  await editInteraction(page, 'New interaction', 'Arrival', 'The journey is complete.');

  await page.goto(`/stories/${storyId}/play`);
  await expect(page.getByRole('heading', { name: 'Start the story' })).toBeVisible();

  let progressSave = waitForApiResponse(
    page,
    'PATCH',
    new RegExp(`/api/stories/${storyId}/progress$`),
  );
  await page.getByRole('button', { name: 'Opening' }).click();
  await expectSuccessful(progressSave);
  await expect(page.getByRole('heading', { name: 'Opening' })).toBeVisible();

  progressSave = waitForApiResponse(page, 'PATCH', new RegExp(`/api/stories/${storyId}/progress$`));
  await page.getByRole('button', { name: 'Arrival' }).click();
  await expectSuccessful(progressSave);
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();
  await expect(page.getByText('Progress saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();

  await page.getByRole('button', { name: 'Saves' }).click();
  const saveDialog = page.getByRole('dialog', { name: 'Manage saves' });
  await expect(saveDialog.getByText('Reader autosave')).toBeVisible();
  await saveDialog.getByRole('textbox', { name: 'Save name' }).fill('At the arrival');
  const manualSave = waitForApiResponse(
    page,
    'POST',
    new RegExp(`/api/stories/${storyId}/progress/saves$`),
  );
  await saveDialog.getByRole('button', { name: 'Create save' }).click();
  await expectSuccessful(manualSave);
  await expect(saveDialog.getByText('At the arrival')).toBeVisible();
  await saveDialog.getByRole('button', { name: 'Close saves' }).click();

  const readerRestart = waitForApiResponse(
    page,
    'DELETE',
    new RegExp(`/api/stories/${storyId}/progress$`),
  );
  await page.getByRole('button', { name: 'Restart' }).click();
  await expectSuccessful(readerRestart);
  await expect(page.getByRole('heading', { name: 'Start the story' })).toBeVisible();

  await page.goto(`/stories/${storyId}/play?mode=simulation`);
  await expect(page.getByText('Simulation', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current interaction title')).toHaveCount(0);

  const simulationSave = waitForApiResponse(
    page,
    'PATCH',
    new RegExp(`/api/stories/${storyId}/progress/simulation$`),
  );
  await page.getByRole('button', { name: 'Opening' }).click();
  await expectSuccessful(simulationSave);
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Opening');

  await page.getByRole('button', { name: 'Saves' }).click();
  const simulationSaveDialog = page.getByRole('dialog', { name: 'Manage saves' });
  const manualSaveEntry = simulationSaveDialog.locator('article').filter({
    hasText: 'At the arrival',
  });
  await expect(manualSaveEntry).toBeVisible();
  const manualLoad = waitForApiResponse(
    page,
    'GET',
    new RegExp(`/api/stories/${storyId}/progress/saves/[^/]+$`),
  );
  const copiedSimulationSave = waitForApiResponse(
    page,
    'PATCH',
    new RegExp(`/api/stories/${storyId}/progress/simulation$`),
  );
  await manualSaveEntry.getByRole('button', { name: 'Load' }).click();
  await expectSuccessful(manualLoad);
  await expectSuccessful(copiedSimulationSave);
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Arrival');

  await page.reload();
  await expect(page.getByText('Simulation', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Arrival');

  await page.goto(`/stories/${storyId}/play`);
  await expect(page.getByRole('heading', { name: 'Start the story' })).toBeVisible();
  await page.getByRole('button', { name: 'Saves' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Manage saves' })
      .locator('article')
      .filter({ hasText: 'At the arrival' }),
  ).toBeVisible();
});
