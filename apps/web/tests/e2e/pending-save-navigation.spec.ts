import { expect, test } from '@playwright/test';
import { cloneStory, mockRuntimeStory, paginated, prepareEditorPage } from './editorTestHarness';

test('guards browser Back while an editor save is in flight', async ({ page }) => {
  await prepareEditorPage(page);
  await page.route('**/api/stories?**', (route) =>
    route.fulfill({
      json: paginated([
        {
          id: 'story-1',
          title: 'Test story',
          interactionCount: 1,
          createdAt: '2026-07-14T08:00:00.000Z',
          updatedAt: '2026-07-14T08:00:00.000Z',
          capabilities: { canRead: true, canEdit: true, canManage: true, canComment: false },
        },
      ]),
    }),
  );
  let releaseSave = () => {};
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const updated = cloneStory();
  updated.interactions[0].title = 'Pending title';
  await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
    await saveRelease;
    await route.fulfill({ json: updated });
  });

  await page.goto('/');
  await page.getByRole('link', { name: /Edit/ }).click();
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Pending title');
  await page.getByLabel('Title', { exact: true }).blur();
  await expect(page.getByLabel('Story save status')).toContainText('Saving');

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(page).toHaveURL('/stories/story-1/edit');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Pending title');

  await page.goBack();
  await page.getByRole('button', { name: 'Leave page' }).click();
  await expect(page).toHaveURL('/');
  await page.goForward();
  await expect(page).toHaveURL('/stories/story-1/edit');
  releaseSave();
});

test('guards browser Forward while an editor save is in flight', async ({ page }) => {
  await prepareEditorPage(page);
  await page.route('**/api/stories?**', (route) => route.fulfill({ json: paginated([]) }));
  let releaseSave = () => {};
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const updated = cloneStory();
  updated.interactions[0].title = 'Forward pending';
  await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
    await saveRelease;
    await route.fulfill({ json: updated });
  });

  await page.goto('/stories/story-1/edit');
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).toHaveURL('/stories/story-1/edit');
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Forward pending');
  await page.getByLabel('Title', { exact: true }).blur();
  await expect(page.getByLabel('Story save status')).toContainText('Saving');

  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(page).toHaveURL('/stories/story-1/edit');
  releaseSave();
  await expect(page.getByLabel('Story save status')).toContainText('Saved');
  await page.goForward();
  await expect(page).toHaveURL('/');
});

test('guards a failed editor save and allows navigation after a successful retry', async ({
  page,
}) => {
  await prepareEditorPage(page);
  await page.route('**/api/stories?**', (route) => route.fulfill({ json: paginated([]) }));
  const updated = cloneStory();
  updated.interactions[0].title = 'Saved title';
  let attempts = 0;
  await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
    attempts += 1;
    await route.fulfill(
      attempts === 1 ? { status: 503, json: { message: 'Unavailable' } } : { json: updated },
    );
  });

  await page.goto('/stories/story-1/edit');
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).toHaveURL('/stories/story-1/edit');
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Retried title');
  await page.getByLabel('Title', { exact: true }).blur();
  await expect(page.getByLabel('Story save status')).toContainText('Save failed');

  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(page).toHaveURL('/stories/story-1/edit');
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Saved title');
  await page.getByLabel('Title', { exact: true }).blur();
  await expect(page.getByLabel('Story save status')).toContainText('Saved');
  await page.reload();
  await expect(page.getByTestId('interaction-node')).toBeVisible();
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('guards Simulation edits and clears the guard after saving', async ({ page }) => {
  await prepareEditorPage(page);
  await mockRuntimeStory(page, cloneStory());
  await page.route('**/api/stories?**', (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/stories/story-1/progress/simulation', (route) =>
    route.fulfill({ json: { progress: null } }),
  );
  let releaseSave = () => {};
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const updated = cloneStory();
  updated.interactions[0].title = 'Edited in Simulation';
  await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
    await saveRelease;
    await route.fulfill({
      json: { interaction: updated.interactions[0], revision: 2, updatedAt: updated.updatedAt },
    });
  });

  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  const title = page.getByLabel('Current interaction title');
  await expect(title).toHaveValue('Original title');
  await title.fill('Edited in Simulation');
  await title.blur();
  await expect(page.getByText(/Saving Story changes/)).toBeVisible();
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(page).toHaveURL(/mode=simulation/);
  releaseSave();
  await expect(page.getByText('Story changes saved')).toBeVisible();
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page).toHaveURL('/');
});
