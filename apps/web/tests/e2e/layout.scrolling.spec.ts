import { expect, test } from '@playwright/test';
import {
  cloneStory,
  mockAuthenticatedUser,
  mockStory,
  paginated,
  prepareEditorPage,
} from './editorTestHarness';

test.describe('Constrained overlays and editor panels', () => {
  test('keeps a tall import dialog scrollable within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await mockAuthenticatedUser(page);
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

  for (const width of [1280, 760]) {
    test(`scrolls inspector content while keeping its border comment toggle usable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 540 });
      const current = cloneStory();
      current.capabilities!.canComment = true;
      current.interactions[0].body = Array.from(
        { length: 30 },
        (_, index) => `<p>Inspector paragraph ${index + 1}.</p>`,
      ).join('');
      await prepareEditorPage(page, current);
      await page.goto('/stories/story-1/edit');
      await page.locator('.react-flow__node[data-id="interaction-1"]').click();

      const inspector = page.getByRole('complementary', { name: 'Inspector' });
      const content = inspector.locator('.inspector-content');
      const toggle = inspector.locator('.inspector-comment-toggle');
      const rail = page.getByRole('complementary', {
        name: 'Comments for the selected element',
      });
      const canvas = page.locator('.canvas');
      const viewport = page.locator('.react-flow__viewport');
      await expect(content).toBeVisible();
      const inspectorBox = (await inspector.boundingBox())!;
      const toggleBefore = (await toggle.boundingBox())!;
      const canvasBefore = await canvas.boundingBox();
      const transformBefore = await viewport.evaluate(
        (element) => getComputedStyle(element).transform,
      );
      const pageScrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));

      expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(540);
      expect(toggleBefore.x).toBeLessThan(inspectorBox.x);
      expect(toggleBefore.x + toggleBefore.width).toBeGreaterThan(inspectorBox.x);
      expect(
        Math.abs(toggleBefore.x + toggleBefore.width / 2 - inspectorBox.x),
      ).toBeLessThanOrEqual(1);
      expect(await content.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );

      // Click the part extending over the graph so clipping cannot pass unnoticed.
      const graphSide = { x: 4, y: toggleBefore.height / 2 };
      await toggle.click({ position: graphSide });
      await expect(rail).toBeVisible();
      await toggle.click({ position: graphSide });
      await expect(rail).toBeHidden();

      const contentBox = (await content.boundingBox())!;
      await content.hover({ position: { x: contentBox.width - 10, y: contentBox.height / 2 } });
      await page.mouse.wheel(0, 600);
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await content.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.mouse.wheel(0, 600);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );

      expect(await canvas.boundingBox()).toEqual(canvasBefore);
      expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(
        transformBefore,
      );
      expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(pageScrollBefore);
      expect(await toggle.boundingBox()).toEqual(toggleBefore);
      await toggle.click({ position: graphSide });
      await expect(rail).toBeVisible();
      await toggle.click({ position: graphSide });
      await expect(rail).toBeHidden();
    });
  }

  test('keeps Story settings sections separated in a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 320 });
    await prepareEditorPage(page);

    await page.goto('/stories/story-1/edit');
    await page
      .getByRole('button', { name: 'Story settings' })
      .evaluate((button: HTMLButtonElement) => button.click());

    const dialog = page.getByRole('dialog', { name: 'Story settings' });
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate((element) => {
      const dialogBox = element.getBoundingClientRect();
      const headerBox = element.querySelector('header')!.getBoundingClientRect();
      const tabsBox = element.querySelector('[role="tablist"]')!.getBoundingClientRect();
      const content = element.querySelector<HTMLElement>('.story-settings-content')!;
      const contentBox = content.getBoundingClientRect();
      const inputBox = element.querySelector('input')!.getBoundingClientRect();
      content.scrollTop = content.scrollHeight;
      return {
        dialog: { top: dialogBox.top, bottom: dialogBox.bottom },
        headerBottom: headerBox.bottom,
        tabsTop: tabsBox.top,
        tabsBottom: tabsBox.bottom,
        contentTop: contentBox.top,
        contentLeft: contentBox.left,
        contentRight: contentBox.right,
        inputLeft: inputBox.left,
        inputRight: inputBox.right,
        overflowY: getComputedStyle(content).overflowY,
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        scrollTop: content.scrollTop,
      };
    });

    expect(layout.dialog.top).toBeGreaterThanOrEqual(0);
    expect(layout.dialog.bottom).toBeLessThanOrEqual(320);
    expect(layout.headerBottom).toBeLessThanOrEqual(layout.tabsTop + 1);
    expect(layout.tabsBottom).toBeLessThanOrEqual(layout.contentTop + 1);
    expect(layout.inputLeft).toBeGreaterThanOrEqual(layout.contentLeft);
    expect(layout.inputRight).toBeLessThanOrEqual(layout.contentRight);
    expect(layout.overflowY).toBe('auto');
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.scrollTop).toBeGreaterThan(0);
  });

  test('stacks access cards and leaves room for collaborator controls', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 520 });
    await prepareEditorPage(page);
    await page.route('**/api/stories/story-1/access', (route) =>
      route.fulfill({
        json: {
          visibility: 'private',
          editPolicy: 'owner',
          commentPolicy: 'editors',
          owner: { id: 'user-1', email: 'author@example.com', displayName: 'Author' },
          collaborators: [],
        },
      }),
    );

    await page.goto('/stories/story-1/edit');
    await page
      .getByRole('button', { name: 'Story settings' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await page.getByRole('tab', { name: 'Access' }).click();
    await expect(page.getByLabel('Reading')).toBeVisible();

    const layout = await page.locator('.story-access-settings').evaluate((element) => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>('.settings-card'));
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>('.collaborator-form > *'),
      ).map((control) => control.getBoundingClientRect());
      const firstCard = cards[0].getBoundingClientRect();
      const secondCard = cards[1].getBoundingClientRect();
      return {
        firstCardBottom: firstCard.bottom,
        secondCardTop: secondCard.top,
        controls: controls.map(({ left, right }) => ({ left, right })),
      };
    });

    expect(layout.firstCardBottom).toBeLessThan(layout.secondCardTop);
    expect(layout.controls[0].right).toBeLessThanOrEqual(layout.controls[1].left);
    expect(layout.controls[1].right).toBeLessThanOrEqual(layout.controls[2].left);
  });
});
