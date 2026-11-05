import { expect, test, type Page } from '@playwright/test';

async function graphNodesFit(page: Page) {
  return page.locator('.react-flow__node').evaluateAll((nodes) => {
    const viewport = document.querySelector('.react-flow')?.getBoundingClientRect();
    return Boolean(
      viewport &&
      nodes.length > 0 &&
      nodes.every((node) => {
        const bounds = node.getBoundingClientRect();
        return (
          bounds.left >= viewport.left - 1 &&
          bounds.top >= viewport.top - 1 &&
          bounds.right <= viewport.right + 1 &&
          bounds.bottom <= viewport.bottom + 1
        );
      }),
    );
  });
}

test('prototype library and editor fit desktop and intermediate viewports', async ({
  page,
}, testInfo) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      apiRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/prototype/paralleax/stories');
  await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
  await expect(page.locator('.pp-story-card')).toHaveCount(4);
  await expect(page.locator('.pp-story-cover')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('prototype-library-desktop.png'),
    fullPage: true,
  });

  await page.goto('/prototype/paralleax?story=archive-below');
  await expect(page.getByRole('heading', { name: 'A room full of echoes' })).toBeVisible();
  await expect.poll(() => graphNodesFit(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('prototype-editor-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => graphNodesFit(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('prototype-editor-intermediate.png'),
    fullPage: true,
  });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(apiRequests).toEqual([]);
});

test('scenario authoring, review, reader, and simulation paths stay local and coherent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/prototype/paralleax?story=harbor-signals');

  await page
    .locator('.react-flow__node[data-id="hs-1"] .react-flow__handle-bottom')
    .dragTo(page.locator('.react-flow__node[data-id="hs-shared"] .react-flow__handle-top'));
  await page.locator('.react-flow__node[data-id="hs-shared"]').click();
  await expect(page.getByText(/one trigger can have several source interactions/i)).toBeVisible();
  await expect(
    page.getByText('Check the ledger · Answer the light · Wait for dawn · A light in the storm'),
  ).toBeVisible();
  await expect(page.locator('.pp-trigger-summary b')).toHaveText('4');
  await page.getByRole('button', { name: /add or group/i }).click();
  await expect(page.getByText('Condition group 3')).toBeVisible();

  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await page.getByLabel('Reply to comment').fill('The signal order is clear now.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByText('The signal order is clear now.')).toBeVisible();
  await page.getByRole('button', { name: 'Close comments' }).click();

  await page.getByRole('button', { name: 'Read' }).click();
  await expect(page.getByRole('group', { name: 'Player mode' })).toBeVisible();
  await expect(page.getByText(/Interaction:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Check the ledger/ })).toBeVisible();
  await page.getByRole('button', { name: /Check the ledger/ }).click();
  await expect(page.getByRole('button', { name: /The keepers meet/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back to editor' }).click();

  await page.goto('/prototype/paralleax?story=archive-below');
  await page.getByRole('button', { name: 'Read' }).click();
  await page.getByRole('button', { name: /The hidden passage/ }).click();
  await expect(page.getByRole('button', { name: /A quiet warning/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter the passage/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Simulation' }).click();
  const blockedChoice = page.getByRole('button', { name: /Enter the passage/ });
  await expect(blockedChoice).toBeDisabled();
  await page.getByLabel(/Force unavailable options/).check();
  await blockedChoice.click();
  await expect(page.getByText(/Trust \+2 · Key obtained/)).toBeVisible();
  await expect(page.getByText('▣ Old brass key')).toBeVisible();

  await page.getByRole('button', { name: /restart/i }).click();
  await expect(page.getByText(/Trust \+2 · Key obtained/)).toHaveCount(0);
  await expect(page.getByText('Current simulation state')).toBeVisible();
});

test('empty story supports inline content and resets to the original demo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/prototype/paralleax?story=blank');

  await page.getByRole('button', { name: 'Add content' }).click();
  await page.getByLabel('Interaction content').fill('A note waits at the station.');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('A note waits at the station.')).toBeVisible();

  await page.getByRole('button', { name: /reset demo/i }).click();
  await expect(page.getByRole('button', { name: 'Add content' })).toBeVisible();
});
