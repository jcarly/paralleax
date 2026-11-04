import { expect, test, type Locator } from '@playwright/test';
import { cloneStory, mockRuntimeStory, prepareEditorPage } from './editorTestHarness';

test('keeps Simulation styling consistent across direct and editor navigation', async ({
  page,
}) => {
  const story = cloneStory();
  await prepareEditorPage(page, story);
  await mockRuntimeStory(page, story);
  await page.route('**/api/stories/story-1/progress/simulation', (route) =>
    route.fulfill({ json: { progress: null } }),
  );

  const readSimulationIndicatorStyle = async () =>
    page.evaluate(() => {
      const badge = document.querySelector('.simulation-mode .player-top .mode-pill');
      if (!(badge instanceof HTMLElement)) {
        throw new Error('Simulation mode indicator must be rendered');
      }
      const badgeStyle = getComputedStyle(badge);
      return {
        background: badgeStyle.backgroundColor,
        border: badgeStyle.borderTopColor,
        text: badgeStyle.color,
      };
    });

  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.locator('.simulation-controls .product-eyebrow')).toBeVisible();
  await expect(page.locator('.simulation-mode .player-top .mode-pill')).toHaveText('Simulation');
  await expect(page.getByRole('textbox', { name: 'Current interaction title' })).toHaveValue(
    'Original title',
  );
  await expect(page.locator('.simulation-body-preview .story-body')).toBeVisible();
  const directIndicatorStyle = await readSimulationIndicatorStyle();
  expect(directIndicatorStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(directIndicatorStyle.border).not.toBe('rgba(0, 0, 0, 0)');
  expect(directIndicatorStyle.text).not.toBe('rgba(0, 0, 0, 0)');
  const directTypography = await readSimulationTypography(page);
  expect(directTypography).toEqual({
    title: 'Georgia, "Times New Roman", serif',
    body: 'Georgia, "Times New Roman", serif',
  });

  await page.goto('/stories/story-1/edit');
  await expect(page.getByTestId('interaction-node')).toContainText('Original title');
  await page.getByRole('button', { name: 'Story settings' }).click();
  const settingsIcon = page.locator('.story-settings-heading-icon');
  await expect(settingsIcon).toBeVisible();
  const settingsColors = await settingsIcon.evaluate((element) => {
    const style = getComputedStyle(element);
    const resolveColor = (token: string) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return {
      background: style.backgroundColor,
      expectedBackground: resolveColor('--color-primary-soft'),
      color: style.color,
      expectedColor: resolveColor('--color-primary'),
    };
  });
  expect(settingsColors.background).toBe(settingsColors.expectedBackground);
  expect(settingsColors.color).toBe(settingsColors.expectedColor);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open Story history' }).click();
  const historyEyebrow = page.locator('.story-history-header .product-eyebrow');
  await expect(historyEyebrow).toBeVisible();
  const historyColors = await readColorAgainstToken(historyEyebrow, '--color-accent');
  expect(historyColors.actual).toBe(historyColors.expected);
  await page.getByRole('button', { name: 'Close history' }).click();

  await page.getByTestId('interaction-node').click();
  await page.getByRole('link', { name: 'Test from current interaction' }).click();
  await page.waitForURL('**/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.locator('.simulation-controls .product-eyebrow')).toBeVisible();
  await expect(page.locator('.simulation-mode .player-top .mode-pill')).toHaveText('Simulation');
  await expect(page.getByRole('textbox', { name: 'Current interaction title' })).toHaveValue(
    'Original title',
  );
  await expect(page.locator('.simulation-body-preview .story-body')).toBeVisible();
  expect(await readSimulationIndicatorStyle()).toEqual(directIndicatorStyle);
  expect(await readSimulationTypography(page)).toEqual(directTypography);
});

async function readSimulationTypography(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const title = document.querySelector('.simulation-title-input');
    const body = document.querySelector('.simulation-body-preview .story-body');
    if (!(title instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error('Simulation title and body must be rendered');
    }
    return {
      title: getComputedStyle(title).fontFamily,
      body: getComputedStyle(body).fontFamily,
    };
  });
}

async function readColorAgainstToken(locator: Locator, token: string) {
  return locator.evaluate((element, tokenName) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${tokenName})`;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(element).color, expected };
  }, token);
}
