import { expect, test } from '@playwright/test';
import { mockAuthenticatedUser, mockRuntimeStory, cloneStory } from './editorTestHarness';

test('keeps reader layout independent from Simulation Mode layout', async ({ page }) => {
  await mockAuthenticatedUser(page);
  await page.route('**/api/stories/story-1/progress**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { progress: null } });
      return;
    }

    const state = route.request().postDataJSON();
    await route.fulfill({ json: { state, updatedAt: '2026-10-24T09:00:00.000Z' } });
  });
  await page.route('**/api/stories/story-1/progress/saves', (route) =>
    route.fulfill({
      json: [
        {
          id: 'save-1',
          kind: 'manual',
          name: 'Before the journey',
          createdAt: '2026-10-24T08:00:00.000Z',
          updatedAt: '2026-10-24T08:00:00.000Z',
        },
      ],
    }),
  );

  const story = cloneStory();
  await mockRuntimeStory(page, story);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stories/story-1/play');
  await expect(page.getByRole('heading', { name: 'Original title' })).toBeVisible();

  const readerLayout = await readPlayerLayout(page);
  expect(readerLayout.page).toMatchObject({
    display: 'grid',
    maxWidth: '1360px',
    padding: '32px',
  });
  expect(readerLayout.card).toMatchObject({
    borderRadius: '16px',
    padding: '40px',
    minHeight: '430px',
  });

  await page.locator('.player-top .player-toolbar-button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const readerSaveRowColor = await page
    .locator('.reader-save-list article')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(readerSaveRowColor).toBe('rgb(251, 251, 248)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowReaderLayout = await readPlayerLayout(page);
  expect(narrowReaderLayout.page.display).toBe('grid');
  expect(narrowReaderLayout.card).toMatchObject({ borderRadius: '16px', padding: '40px' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.getByRole('textbox', { name: 'Current interaction title' })).toHaveValue(
    'Original title',
  );
  await expect(page.locator('.simulation-controls')).toBeVisible();

  const simulationLayout = await readPlayerLayout(page);
  expect(simulationLayout.page).toMatchObject({
    display: 'grid',
    maxWidth: 'none',
    padding: '0px',
  });
  expect(simulationLayout.card).toMatchObject({
    borderRadius: '0px',
    padding: '0px',
    overflow: 'auto',
  });

  await page.locator('.player-top .player-toolbar-button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.reader-save-list article').evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe(readerSaveRowColor);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowSimulationLayout = await readPlayerLayout(page);
  expect(narrowSimulationLayout.page.display).toBe('flex');
  expect(narrowSimulationLayout.card).toMatchObject({ borderRadius: '0px', padding: '0px' });
});

async function readPlayerLayout(page: import('@playwright/test').Page) {
  return page.locator('.player-page').evaluate((element) => {
    const page = getComputedStyle(element);
    const card = getComputedStyle(element.querySelector('.player-card')!);

    return {
      page: {
        display: page.display,
        maxWidth: page.maxWidth,
        padding: page.padding,
        gridTemplateColumns: page.gridTemplateColumns,
      },
      card: {
        borderRadius: card.borderRadius,
        padding: card.padding,
        minHeight: card.minHeight,
        overflow: card.overflow,
      },
    };
  });
}
