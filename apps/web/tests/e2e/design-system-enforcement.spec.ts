import { expect, test, type Locator } from '@playwright/test';
import {
  mockAuthenticatedLibrary,
  mockRuntimeStory,
  prepareEditorPage,
  story,
} from './editorTestHarness';

test('documents and preserves the separate product and authoring action families', async ({
  page,
}) => {
  await page.goto('/design-system');

  const productActions = page.getByTestId('product-action-catalogue');
  const authoringActions = page.getByTestId('authoring-action-catalogue');
  const productPrimary = productActions.getByTestId('product-primary-sample');
  const productSecondary = productActions.getByTestId('product-secondary-sample');
  const authoringSecondary = authoringActions.getByTestId('authoring-secondary-sample');
  await expect(productPrimary).toHaveClass(/\bproduct-primary\b/);
  await expect(productSecondary).toHaveClass(/\bproduct-secondary\b/);
  await expect(authoringActions.getByRole('button', { name: 'Primary action' })).toHaveClass(
    /\bbutton\b/,
  );
  await expect(authoringSecondary).toHaveClass(/\bsecondary\b/);
  await expect(authoringActions.getByRole('button', { name: 'Ghost action' })).toHaveClass(
    /\bghost\b/,
  );
  await expect(authoringActions.getByRole('button', { name: 'Delete' })).toHaveClass(/\bdanger\b/);
  await expect(productActions.getByText('Defined, unused by product workflows')).toBeVisible();
  const productPrimaryColors = await readActionColors(productPrimary);
  const productSecondaryColors = await readActionColors(productSecondary);
  const authoringSecondaryColors = await readActionColors(authoringSecondary);

  await mockAuthenticatedLibrary(page);
  await page.goto('/');
  const actualProductPrimary = page.getByRole('button', { name: 'New story' });
  const actualProductSecondary = page.getByRole('button', { name: 'Import a story' });
  await expect(actualProductPrimary).toBeVisible();
  await expect(actualProductSecondary).toBeVisible();
  await expectActionColors(actualProductPrimary, productPrimaryColors);
  await expectActionColors(actualProductSecondary, productSecondaryColors);

  const editorPage = await page.context().newPage();
  await prepareEditorPage(editorPage);
  await editorPage.goto('/stories/story-1/edit');
  await expect(editorPage.getByTestId('interaction-node')).toBeVisible();
  const actualAuthoringSecondary = editorPage.getByRole('link', { name: 'Test from start' });
  await expect(actualAuthoringSecondary).toHaveClass(/\bbutton\b/);
  await expect(actualAuthoringSecondary).toHaveClass(/\bsecondary\b/);
  await expect(actualAuthoringSecondary).toBeVisible();
  await expectActionColors(actualAuthoringSecondary, authoringSecondaryColors);
});

test('uses shared standard controls in story creation, settings, and reader saves', async ({
  page,
}) => {
  await mockAuthenticatedLibrary(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New story' }).click();
  const storyTitle = page.getByLabel('Story title');
  await expectSharedStandardField(storyTitle);
  await page.keyboard.press('Escape');

  await prepareEditorPage(page);
  await page.goto('/stories/story-1/edit');
  await page.getByRole('button', { name: 'Story settings' }).click();
  await expectSharedStandardField(page.getByLabel('Story start date and time', { exact: true }));

  await page.route('**/api/stories/story-1/progress', (route) =>
    route.fulfill({ json: { progress: null } }),
  );
  await page.route('**/api/stories/story-1/progress/saves', (route) => route.fulfill({ json: [] }));
  const readerButton = page.getByRole('button', { name: 'Close Story settings' });
  await readerButton.click();
  await mockRuntimeStory(page, story);
  await page.goto('/stories/story-1/play');
  await page.getByRole('button', { name: 'Saves' }).click();
  await expectSharedStandardField(page.getByLabel('Save name'));
});

async function expectSharedStandardField(locator: Locator) {
  await expect(locator).toHaveClass(/\bform-control\b/);
  await expect(locator).toHaveClass(/\bform-control--standard\b/);
  await expect(locator).toHaveCSS('min-height', '44px');
}

async function readActionColors(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderTopColor,
    };
  });
}

async function expectActionColors(
  locator: Locator,
  expected: Awaited<ReturnType<typeof readActionColors>>,
) {
  await expect(locator).toHaveCSS('background-color', expected.backgroundColor);
  await expect(locator).toHaveCSS('color', expected.color);
  await expect(locator).toHaveCSS('border-top-color', expected.borderColor);
}
