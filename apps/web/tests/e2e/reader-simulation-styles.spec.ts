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

  const readerTypography = await readNarrativeTypography(page, '.story-body', 'h1');
  expect(readerTypography.bodyFontFamily).toBe('Georgia, "Times New Roman", serif');
  expect(readerTypography.titleFontFamily).toBe('Georgia, "Times New Roman", serif');

  const productTypography = await page.evaluate(() => {
    const productPage = document.createElement('div');
    productPage.className = 'product-page';
    productPage.innerHTML =
      '<label class="product-field">Story title<input value="Example"><small>Help text</small></label>' +
      '<div class="type-samples"><div class="display-sample"><b class="display-sample-text">Display</b></div>' +
      '<div><b class="heading-sample">Heading</b></div><div><p class="body-sample">Body</p></div></div>';
    document.body.append(productPage);
    const label = productPage.querySelector('label')!;
    const input = productPage.querySelector('input')!;
    const help = productPage.querySelector('small')!;
    const display = productPage.querySelector('.display-sample-text')!;
    const heading = productPage.querySelector('.heading-sample')!;
    const body = productPage.querySelector('.body-sample')!;
    const result = {
      pageFamily: getComputedStyle(productPage).fontFamily,
      rootFamily: getComputedStyle(document.documentElement).fontFamily,
      labelSize: getComputedStyle(label).fontSize,
      inputSize: getComputedStyle(input).fontSize,
      helpSize: getComputedStyle(help).fontSize,
      displayFamily: getComputedStyle(display).fontFamily,
      displaySize: getComputedStyle(display).fontSize,
      displayLeading: getComputedStyle(display).lineHeight,
      headingSize: getComputedStyle(heading).fontSize,
      headingLeading: getComputedStyle(heading).lineHeight,
      bodySize: getComputedStyle(body).fontSize,
      bodyLeading: getComputedStyle(body).lineHeight,
    };
    productPage.remove();
    return result;
  });
  expect(productTypography.pageFamily).toBe(productTypography.rootFamily);
  expect(productTypography).toMatchObject({
    labelSize: '12px',
    inputSize: '14px',
    helpSize: '12px',
    displayFamily: 'Georgia, "Times New Roman", serif',
    displaySize: '48px',
    displayLeading: '52px',
    headingSize: '24px',
    headingLeading: '30px',
    bodySize: '14px',
    bodyLeading: '22px',
  });

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

  const simulationTypography = await readNarrativeTypography(
    page,
    '.rich-text-surface',
    '.simulation-title-input',
  );
  expect(simulationTypography.bodyFontFamily).toBe(readerTypography.bodyFontFamily);
  expect(simulationTypography.titleFontFamily).toBe(readerTypography.titleFontFamily);
  expect(simulationTypography.bodyFontSize).toBe(readerTypography.bodyFontSize);
  expect(simulationTypography.titleFontSize).toBe(readerTypography.titleFontSize);
  expect(simulationTypography.bodyLineHeight).toBe(readerTypography.bodyLineHeight);
  expect(simulationTypography.titleLineHeight).toBe(readerTypography.titleLineHeight);

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
      page
        .locator('.reader-save-list article')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
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

async function readNarrativeTypography(
  page: import('@playwright/test').Page,
  bodySelector: string,
  titleSelector: string,
) {
  return page.evaluate(
    ({ bodySelector, titleSelector }) => {
      const body = document.querySelector(bodySelector);
      const title = document.querySelector(titleSelector);
      if (!(body instanceof HTMLElement) || !(title instanceof HTMLElement)) {
        throw new Error('Narrative title and body must be rendered');
      }
      return {
        bodyFontFamily: getComputedStyle(body).fontFamily,
        bodyFontSize: getComputedStyle(body).fontSize,
        bodyLineHeight: getComputedStyle(body).lineHeight,
        titleFontFamily: getComputedStyle(title).fontFamily,
        titleFontSize: getComputedStyle(title).fontSize,
        titleLineHeight: getComputedStyle(title).lineHeight,
      };
    },
    { bodySelector, titleSelector },
  );
}
