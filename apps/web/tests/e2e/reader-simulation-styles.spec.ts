import { expect, test, type Page } from '@playwright/test';
import type { Story } from '@paralleax/shared';
import { mockAuthenticatedUser, mockRuntimeStory, cloneStory } from './editorTestHarness';

test('shares Reader and Simulation player layout while keeping mode-specific controls', async ({
  page,
}) => {
  await preparePlayer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const reader = await assertReaderDesktopPresentation(page);
  const readerSaveRowColor = await assertReaderSaveRowColor(page);
  await assertSimulationDesktopPresentation(page, reader, readerSaveRowColor);
  const simulationResponsive = await assertSimulationResponsiveLayout(page);
  await assertReaderResponsiveLayout(page, simulationResponsive);
});

async function assertReaderDesktopPresentation(page: Page) {
  const typography = await assertReaderDesktopTypography(page);
  const layout = await assertReaderDesktopLayout(page);
  return { layout, typography };
}

async function assertReaderDesktopTypography(page: Page) {
  await page.goto('/stories/story-1/play');
  await expect(page.locator('.character-choice-card')).toBeVisible();
  const characterChoice = await readStyle(page, '.character-choice-card');
  expect(characterChoice).toMatchObject({
    display: 'grid',
    borderRadius: '10px',
    backgroundColor: 'rgb(255, 255, 255)',
  });
  await page.locator('.character-choice-card').click();
  await expectReaderTechnicalTitleHidden(page, 'A brass door waits at the end of the hall.');

  const readerTypography = await readNarrativeTypography(page, '.story-body');
  expect(readerTypography).toMatchObject({
    bodyFontFamily: 'Georgia, "Times New Roman", serif',
    bodyFontSize: '18.4px',
  });

  return readerTypography;
}

async function assertReaderDesktopLayout(page: Page) {
  const readerLayout = await readPlayerLayout(page);
  expect(readerLayout.page).toMatchObject({
    display: 'grid',
    maxWidth: 'none',
    padding: '0px',
  });
  expect(readerLayout.header).toMatchObject({
    backgroundColor: 'rgb(31, 48, 41)',
    position: 'static',
  });
  expect(readerLayout.card).toMatchObject({
    borderRadius: '0px',
    padding: '0px',
    minHeight: '0px',
    overflow: 'auto',
  });
  expect(Number.parseFloat(readerLayout.scene.height)).toBeGreaterThan(190);
  expect(Number.parseFloat(readerLayout.content.width)).toBeLessThanOrEqual(780);
  expect(readerLayout.choice).toMatchObject({
    minHeight: '58px',
    backgroundColor: 'rgb(255, 255, 255)',
  });
  expect(readerLayout.inventory).toMatchObject({
    alignSelf: 'stretch',
    borderRadius: '0px',
    backgroundColor: 'rgb(241, 241, 237)',
    width: '260px',
    overflow: 'auto',
  });
  expect(readerLayout.encounter).toMatchObject({
    position: 'static',
    alignSelf: 'stretch',
    width: '250px',
    overflow: 'auto',
  });

  return readerLayout;
}

async function assertReaderSaveRowColor(page: Page) {
  await page.locator('.player-top .player-toolbar-button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const readerSaveRowColor = await page
    .locator('.reader-save-list article')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(readerSaveRowColor).toBe('rgb(251, 251, 248)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return readerSaveRowColor;
}

async function assertSimulationDesktopPresentation(
  page: Page,
  reader: Awaited<ReturnType<typeof assertReaderDesktopPresentation>>,
  readerSaveRowColor: string,
) {
  await assertSimulationDesktopTypography(page, reader.typography);
  const simulationLayout = await assertSimulationDesktopLayout(page, reader.layout);
  await assertSimulationSaveRowColor(page, readerSaveRowColor);
  return simulationLayout;
}

async function assertSimulationDesktopTypography(
  page: Page,
  readerTypography: Awaited<ReturnType<typeof readNarrativeTypography>>,
) {
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.getByRole('textbox', { name: 'Current interaction title' })).toHaveValue(
    'Original title',
  );
  await expect(page.locator('.simulation-controls')).toBeVisible();
  await expect(page.locator('.reader-comment-actions')).toHaveCount(0);

  const simulationTypography = await readNarrativeTypography(
    page,
    '.simulation-body-preview .story-body',
  );
  expect(simulationTypography.bodyFontFamily).toBe(readerTypography.bodyFontFamily);
  expect(simulationTypography.bodyFontSize).toBe(readerTypography.bodyFontSize);
  expect(simulationTypography.bodyLineHeight).toBe(readerTypography.bodyLineHeight);
}

async function assertSimulationDesktopLayout(
  page: Page,
  readerLayout: Awaited<ReturnType<typeof readPlayerLayout>>,
) {
  const simulationLayout = await readPlayerLayout(page);
  await expect(page.locator('.player-inventory .player-history summary')).toHaveText(
    'Simulation history',
  );
  expect(simulationLayout.page).toEqual(readerLayout.page);
  expect(simulationLayout.page).toMatchObject({
    display: 'grid',
    maxWidth: 'none',
    padding: '0px',
  });
  expect(simulationLayout.header).toMatchObject({
    backgroundColor: 'rgb(31, 48, 41)',
    position: 'static',
  });
  expect(simulationLayout.card).toMatchObject({
    borderRadius: '0px',
    padding: '0px',
    overflow: 'auto',
  });
  expect(simulationLayout.inventory).toMatchObject({
    alignSelf: 'stretch',
    borderRadius: '0px',
    backgroundColor: 'rgb(241, 241, 237)',
    width: '260px',
    overflow: 'auto',
  });
  expect(simulationLayout.encounter).toMatchObject({
    position: 'static',
    alignSelf: 'stretch',
    width: '250px',
    overflow: 'auto',
  });
  await expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();
  const unavailableChoice = page.getByRole('button', { name: /Unavailable option/ });
  await expect(unavailableChoice).toBeDisabled();
  return simulationLayout;
}

async function assertSimulationSaveRowColor(page: Page, readerSaveRowColor: string) {
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
}

async function assertSimulationResponsiveLayout(page: Page) {
  await page.setViewportSize({ width: 900, height: 768 });
  const tabletSimulationLayout = await readPlayerLayout(page);
  expect(tabletSimulationLayout.page.display).toBe('grid');
  expect(tabletSimulationLayout.encounter).toMatchObject({
    position: 'absolute',
    width: '210px',
  });
  expect(tabletSimulationLayout.overflowX).toBeLessThanOrEqual(900);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowSimulationLayout = await readPlayerLayout(page);
  expect(narrowSimulationLayout.page.display).toBe('flex');
  expect(narrowSimulationLayout.card).toMatchObject({
    borderRadius: '0px',
    padding: '0px',
    overflow: 'visible',
  });
  expect(narrowSimulationLayout.header.position).toBe('sticky');
  expect(narrowSimulationLayout.inventory.order).toBe('2');
  expect(narrowSimulationLayout.inventory.overflow).toBe('visible');
  expect(narrowSimulationLayout.encounter.order).toBe('3');
  expect(narrowSimulationLayout.overflowX).toBeLessThanOrEqual(390);
  return { narrow: narrowSimulationLayout, tablet: tabletSimulationLayout };
}

async function assertReaderResponsiveLayout(
  page: Page,
  simulation: Awaited<ReturnType<typeof assertSimulationResponsiveLayout>>,
) {
  await page.goto('/stories/story-1/play');
  await page.setViewportSize({ width: 900, height: 768 });
  await page.locator('.character-choice-card').click();
  await expectReaderTechnicalTitleHidden(page, 'A brass door waits at the end of the hall.');
  const tabletReaderLayout = await readPlayerLayout(page);
  expect(tabletReaderLayout.page).toEqual(simulation.tablet.page);
  expect(tabletReaderLayout.page.display).toBe('grid');
  expect(tabletReaderLayout.encounter).toMatchObject({
    position: 'absolute',
    width: '210px',
  });
  expect(tabletReaderLayout.overflowX).toBeLessThanOrEqual(900);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowReaderLayout = await readPlayerLayout(page);
  expect(narrowReaderLayout.page).toMatchObject({
    ...simulation.narrow.page,
    height: expect.any(String),
  });
  expect(narrowReaderLayout.page.display).toBe('flex');
  expect(narrowReaderLayout.card).toMatchObject({
    borderRadius: '0px',
    padding: '0px',
    overflow: 'visible',
  });
  expect(narrowReaderLayout.header.position).toBe('sticky');
  expect(narrowReaderLayout.inventory).toMatchObject({ order: '2', overflow: 'visible' });
  expect(narrowReaderLayout.encounter).toMatchObject({ order: '3', position: 'static' });
  expect(narrowReaderLayout.overflowX).toBeLessThanOrEqual(390);
}

test('allows in-place Simulation title editing', async ({ page }) => {
  await preparePlayer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  const title = page.getByRole('textbox', { name: 'Current interaction title' });
  await expect(page.locator('.simulation-controls')).toBeVisible();
  await expect(title).toHaveValue('Original title');
  await title.fill('Edited title');
  await expect(title).toHaveValue('Edited title');
  expect(await readStyle(page, '.simulation-title-input')).toMatchObject({
    outlineStyle: 'solid',
    outlineWidth: '2px',
  });
});

test('allows in-place Simulation narrative editing', async ({ page }) => {
  await preparePlayer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.locator('.simulation-controls')).toBeVisible();
  await expect(page.locator('.simulation-body-preview .story-body')).toHaveText(
    'A brass door waits at the end of the hall.',
  );
  await page.locator('.simulation-body-preview').focus();
  const body = page.getByRole('textbox', { name: 'Current interaction content' });
  await expect(body).toHaveText('A brass door waits at the end of the hall.');
  await body.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Edited narrative content');
  await expect(body).toHaveText('Edited narrative content');
});

test('shows forced unavailable choices in Simulation and preserves Reader endings', async ({
  page,
}) => {
  await preparePlayer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  const unavailableChoice = page.getByRole('button', { name: /Unavailable option/ });
  await expect(unavailableChoice).toBeDisabled();
  await page.locator('.simulation-controls input[type="checkbox"]').check();
  await expect(unavailableChoice).toBeEnabled();
  await expect(unavailableChoice).toHaveClass(/forced/);
  await expect
    .poll(() => readStyle(page, '.choice.forced').then(({ backgroundColor }) => backgroundColor))
    .toBe('rgb(255, 250, 240)');
  expect(await readStyle(page, '.choice.forced')).toMatchObject({
    borderStyle: 'dashed',
    opacity: '1',
  });

  await page.goto('/stories/story-1/play');
  await page.locator('.character-choice-card').click();
  await expectReaderTechnicalTitleHidden(page, 'A brass door waits at the end of the hall.');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Continue' })).toBeVisible();
  await expect(page.locator('.ending')).toBeVisible();
  const ending = await readStyle(page, '.ending');
  expect(ending).toMatchObject({
    display: 'grid',
    borderRadius: '9px',
    backgroundColor: 'rgb(241, 241, 237)',
  });
  await expect(page.locator('.simulation-title-input')).toHaveCount(0);
});

async function expectReaderTechnicalTitleHidden(page: Page, visibleContent: string) {
  const sceneTitle = page.getByRole('heading', { name: 'Original title' });
  await expect(sceneTitle).toBeAttached();
  await expect(sceneTitle).toHaveClass(/sr-only/);
  await expect(page.locator('.story-body')).toContainText(visibleContent);
}

async function preparePlayer(page: Page) {
  await mockAuthenticatedUser(page);
  const currentStory = createStyleStory();
  await mockRuntimeStory(page, () => currentStory);
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
  return { getStory: () => currentStory };
}

function createStyleStory(): Story {
  const story = cloneStory();
  story.characters = [
    {
      id: 'character-1',
      name: 'Mira Vale',
      description: 'A careful cartographer.',
      isPlayable: true,
    },
    {
      id: 'character-2',
      name: 'Ivo Reed',
      description: 'A patient guide.',
    },
  ];
  story.locations = [{ id: 'location-1', name: 'Clockwork Hall', description: 'A quiet hall.' }];
  story.statDefinitions = [{ id: 'stat-1', name: 'Courage', valueType: 'number' }];
  story.interactions[0] = {
    ...story.interactions[0],
    body: 'A brass door waits at the end of the hall.',
    locationId: 'location-1',
    characterIds: ['character-1', 'character-2'],
  };
  story.interactions.push(
    {
      id: 'interaction-2',
      title: 'Continue',
      body: 'The story reaches its close.',
      position: { x: 360, y: 140 },
      triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
    },
    {
      id: 'interaction-3',
      title: 'Unavailable option',
      body: 'This route is currently unavailable.',
      position: { x: 600, y: 140 },
      triggers: [
        {
          id: 'trigger-3',
          inputInteractionIds: ['interaction-1'],
          conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
        },
      ],
    },
  );
  return story;
}

async function readPlayerLayout(page: Page) {
  return page.locator('.player-page').evaluate((element) => {
    const style = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) {
        return null;
      }
      const computed = getComputedStyle(target);
      return {
        display: computed.display,
        position: computed.position,
        order: computed.order,
        width: computed.width,
        height: computed.height,
        minHeight: computed.minHeight,
        padding: computed.padding,
        borderRadius: computed.borderRadius,
        backgroundColor: computed.backgroundColor,
        alignSelf: computed.alignSelf,
        overflow: computed.overflow,
      };
    };
    const root = getComputedStyle(element);
    return {
      page: {
        display: root.display,
        height: root.height,
        minHeight: root.minHeight,
        maxWidth: root.maxWidth,
        padding: root.padding,
        position: root.position,
        width: root.width,
        gridTemplateColumns: root.gridTemplateColumns,
        gridTemplateRows: root.gridTemplateRows,
        overflow: root.overflow,
      },
      header: style('.player-top'),
      card: style('.player-card'),
      scene: style('.player-scene-visual'),
      content: style('.player-story-content'),
      title: style('.player-story-content > h1'),
      choice: style('.player-story-content .choice'),
      inventory: style('.player-inventory'),
      encounter: style('.encounter-panel'),
      ending: style('.ending'),
      overflowX: document.documentElement.scrollWidth,
    };
  });
}

async function readStyle(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      position: style.position,
      width: style.width,
      height: style.height,
      minHeight: style.minHeight,
      borderRadius: style.borderRadius,
      borderStyle: style.borderStyle,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

async function readNarrativeTypography(page: Page, bodySelector: string) {
  return page.evaluate(
    ({ bodySelector }) => {
      const body = document.querySelector(bodySelector);
      if (!(body instanceof HTMLElement)) {
        throw new Error('Narrative body must be rendered');
      }
      return {
        bodyFontFamily: getComputedStyle(body).fontFamily,
        bodyFontSize: getComputedStyle(body).fontSize,
        bodyLineHeight: getComputedStyle(body).lineHeight,
      };
    },
    { bodySelector },
  );
}
