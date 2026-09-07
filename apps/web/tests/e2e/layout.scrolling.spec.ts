import { expect, test } from '@playwright/test';
import { cloneStory, mockStory, paginated, prepareEditorPage } from './editorTestHarness';

test.describe('Constrained overlays and editor panels', () => {
  test('keeps a tall import dialog scrollable within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 'user-1',
          email: 'author@example.com',
          role: 'member',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    await page.route('**/api/stories**', (route) => route.fulfill({ json: paginated([]) }));

    await page.goto('/stories');
    await page.getByRole('button', { name: 'Import a story' }).click();

    const dialog = page.locator('.choicescript-import-dialog');
    await expect(dialog).toBeVisible();
    const dimensions = await dialog.evaluate((element) => {
      const styles = getComputedStyle(element);
      element.scrollTop = element.scrollHeight;
      return {
        clientHeight: element.clientHeight,
        overflowY: styles.overflowY,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
    });

    expect(dimensions.overflowY).toBe('auto');
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    expect(dimensions.scrollTop).toBeGreaterThan(0);
  });

  test('scrolls long context lists independently from the graph', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 420 });
    await prepareEditorPage(page);
    const current = cloneStory();
    current.locations = Array.from({ length: 40 }, (_, index) => ({
      id: `location-${index + 1}`,
      name: `Location ${index + 1}`,
    }));
    await mockStory(page, current);

    await page.goto('/stories/story-1/edit');

    const panel = page.locator('.location-panel-content');
    await expect(panel).toBeVisible();
    const dimensions = await panel.evaluate((element) => {
      const styles = getComputedStyle(element);
      element.scrollTop = element.scrollHeight;
      return {
        clientHeight: element.clientHeight,
        overflowY: styles.overflowY,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
    });

    expect(dimensions.overflowY).toBe('auto');
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    expect(dimensions.scrollTop).toBeGreaterThan(0);
  });
});
