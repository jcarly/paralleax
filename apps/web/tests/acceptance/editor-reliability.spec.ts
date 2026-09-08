import { expect, test } from '@playwright/test';
import {
  createdInteraction,
  editInteraction,
  expectSuccessful,
  interactionNode,
  registerAndCreateStory,
  waitForApiResponse,
  waitForInteractionPatch,
} from './realStackTestHarness';

test('undo and redo remain durable after full editor reloads', async ({ page }) => {
  const { storyId } = await registerAndCreateStory(page, 'Durable history');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  const rootCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await page.getByRole('button', { name: 'Add root' }).click();
  await createdInteraction(rootCreation);
  await editInteraction(page, 'New interaction', 'Opening', 'First durable version.');

  await interactionNode(page, 'Opening').click();
  const secondVersion = waitForInteractionPatch(page);
  await inspector.getByRole('textbox', { name: 'Content' }).fill('Second durable version.');
  await inspector.getByRole('textbox', { name: 'Content' }).blur();
  await expectSuccessful(secondVersion);
  await expect(page.getByLabel('Story save status')).toHaveText('Saved');

  const undo = waitForApiResponse(
    page,
    'POST',
    new RegExp(`/api/stories/${storyId}/history/undo$`),
  );
  await page.getByRole('button', { name: 'Undo last Story change' }).click();
  await expectSuccessful(undo);
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'First durable version.',
  );

  await page.reload();
  await expect(interactionNode(page, 'Opening')).toBeVisible();
  await interactionNode(page, 'Opening').click();
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'First durable version.',
  );

  const redoButton = page.getByRole('button', { name: 'Redo Story change' });
  await expect(redoButton).toBeEnabled();
  const redo = waitForApiResponse(
    page,
    'POST',
    new RegExp(`/api/stories/${storyId}/history/redo$`),
  );
  await redoButton.click();
  await expectSuccessful(redo);
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'Second durable version.',
  );

  await page.reload();
  await expect(interactionNode(page, 'Opening')).toBeVisible();
  await interactionNode(page, 'Opening').click();
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'Second durable version.',
  );
});

test('a network failure is visible, blocks navigation, and can be recovered safely', async ({
  context,
  page,
}) => {
  await registerAndCreateStory(page, 'Failed save');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  const rootCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await page.getByRole('button', { name: 'Add root' }).click();
  await createdInteraction(rootCreation);
  await editInteraction(page, 'New interaction', 'Persisted interaction', 'Persisted content.');
  await expect(page.getByLabel('Story save status')).toHaveText('Saved');

  await interactionNode(page, 'Persisted interaction').click();
  await context.setOffline(true);
  await inspector.getByLabel('Title').fill('Unsaved interaction');
  await inspector.getByLabel('Title').blur();

  await expect(page.getByLabel('Story save status')).toHaveText('Save failed');
  await expect(page.getByRole('button', { name: 'Reload story' })).toBeVisible();

  const dialogPromise = page.waitForEvent('dialog');
  const navigationAttempt = page.getByRole('link', { name: 'Stories', exact: true }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe(
    'This story still has unsaved changes. Leave this page and discard them?',
  );
  await dialog.dismiss();
  await navigationAttempt;
  await expect(page).toHaveURL(/\/stories\/[^/]+\/edit$/);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reload story' }).click();
  await expect(interactionNode(page, 'Persisted interaction')).toBeVisible();
  await expect(interactionNode(page, 'Unsaved interaction')).toHaveCount(0);

  await interactionNode(page, 'Persisted interaction').click();
  const recoveredSave = waitForInteractionPatch(page);
  await inspector.getByLabel('Title').fill('Recovered interaction');
  await inspector.getByLabel('Title').blur();
  await expectSuccessful(recoveredSave);
  await expect(page.getByLabel('Story save status')).toHaveText('Saved');

  await page.reload();
  await expect(interactionNode(page, 'Recovered interaction')).toBeVisible();
  await interactionNode(page, 'Recovered interaction').click();
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'Persisted content.',
  );
});

test('slow reordered saves preserve graph creation, movement, and deletion across reloads', async ({
  page,
}) => {
  const { storyId } = await registerAndCreateStory(page, 'Structural reliability');

  const rootCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await page.getByRole('button', { name: 'Add root' }).click();
  const root = await createdInteraction(rootCreation);
  await editInteraction(page, 'New interaction', 'Stable root', 'Structural test root.');

  let releaseSlowResponse = () => {};
  const slowResponseRelease = new Promise<void>((resolve) => {
    releaseSlowResponse = resolve;
  });
  let markSlowMutationCommitted = () => {};
  const slowMutationCommitted = new Promise<void>((resolve) => {
    markSlowMutationCommitted = resolve;
  });
  const storyMutationPath = new RegExp(`/api/stories/${storyId}$`);

  await page.route(storyMutationPath, async (route) => {
    const request = route.request();
    if (
      request.method() !== 'PATCH' ||
      (request.postDataJSON() as { title?: string }).title !== 'Slow structural save'
    ) {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    markSlowMutationCommitted();
    await slowResponseRelease;
    await route.fulfill({ response });
  });

  const slowSave = waitForApiResponse(page, 'PATCH', storyMutationPath);
  await page.locator('.story-title-input').fill('Slow structural save');
  await page.locator('.story-title-input').blur();
  await slowMutationCommitted;
  await expect(page.getByLabel('Story save status')).toContainText('Saving');

  const childCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await interactionNode(page, 'Stable root')
    .getByRole('button', { name: 'Create child interaction' })
    .click();
  const child = await createdInteraction(childCreation);
  const childTriggerId = child.triggers[0]?.id;
  expect(childTriggerId).toBeTruthy();
  await expect(interactionNode(page, 'New interaction')).toBeVisible();
  await expect(page.getByLabel('Story save status')).toContainText('Saving');

  releaseSlowResponse();
  await expectSuccessful(slowSave);
  await expect(page.getByLabel('Story save status')).toHaveText('Saved');
  await expect(interactionNode(page, 'New interaction')).toBeVisible();
  await editInteraction(page, 'New interaction', 'Movable child', 'Created during the slow save.');
  await page.getByRole('button', { name: 'Close inspector' }).click();

  const childNode = page.locator(`.react-flow__node[data-id="${child.id}"]`);
  await page.getByRole('button', { name: 'Fit View' }).click();
  await expect(childNode).toBeInViewport();
  const initialTransform = await childNode.evaluate((element) => element.style.transform);
  const childBox = await childNode.boundingBox();
  expect(childBox).not.toBeNull();

  const positionSave = waitForApiResponse(
    page,
    'PATCH',
    new RegExp(`/api/stories/${storyId}/graph/positions$`),
  );
  await page.mouse.move(childBox!.x + childBox!.width / 2, childBox!.y + childBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    childBox!.x + childBox!.width / 2 + 140,
    childBox!.y + childBox!.height / 2 + 90,
    { steps: 8 },
  );
  await page.mouse.up();
  await expectSuccessful(positionSave);
  const persistedTransform = await childNode.evaluate((element) => element.style.transform);
  expect(persistedTransform).not.toBe(initialTransform);

  await page.reload();
  await expect(page.locator('.story-title-input')).toHaveValue('Slow structural save');
  await expect(interactionNode(page, 'Stable root')).toBeVisible();
  await expect(interactionNode(page, 'Movable child')).toBeVisible();
  await expect
    .poll(() => childNode.evaluate((element) => element.style.transform))
    .toBe(persistedTransform);

  await interactionNode(page, 'Movable child').click();
  page.once('dialog', (dialog) => dialog.accept());
  const deletion = waitForApiResponse(
    page,
    'DELETE',
    new RegExp(`/api/stories/${storyId}/interactions/${child.id}$`),
  );
  await page.getByRole('button', { name: 'Delete interaction' }).click();
  await expectSuccessful(deletion);
  await expect(interactionNode(page, 'Movable child')).toHaveCount(0);
  await expect(page.getByTestId(`flow-trigger-${child.id}-${childTriggerId}`)).toHaveCount(0);

  await page.reload();
  await expect(interactionNode(page, 'Stable root')).toBeVisible();
  await expect(interactionNode(page, 'Movable child')).toHaveCount(0);
  await expect(page.locator(`.react-flow__node[data-id="${root.id}"]`)).toBeVisible();
});
