import { expect, test, type Locator } from '@playwright/test';
import { cloneStory, mockRuntimeStory, prepareEditorPage } from './editorTestHarness';

test('resolves shared semantic colors in direct Simulation and editor navigation', async ({
  page,
}) => {
  const story = cloneStory();
  await prepareEditorPage(page, story);
  await mockRuntimeStory(page, story);
  await page.route('**/api/stories/story-1/progress/simulation', (route) =>
    route.fulfill({ json: { progress: null } }),
  );

  const readSimulationColors = async () =>
    page.evaluate(() => {
      const resolveColor = (token: string) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const badge = document.querySelector('.simulation-edit-label .product-badge.accent');
      if (!(badge instanceof HTMLElement)) {
        throw new Error('Simulation badge must be rendered');
      }
      const badgeStyle = getComputedStyle(badge);
      return {
        badgeBackground: badgeStyle.backgroundColor,
        expectedBadgeBackground: resolveColor('--color-primary-soft'),
        badgeText: badgeStyle.color,
        expectedBadgeText: resolveColor('--color-primary-strong'),
      };
    });

  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  await expect(page.locator('.simulation-controls .product-eyebrow')).toBeVisible();
  const directColors = await readSimulationColors();
  const directTypography = await readSimulationTypography(page);
  expect(directColors.badgeBackground).toBe(directColors.expectedBadgeBackground);
  expect(directColors.badgeText).toBe(directColors.expectedBadgeText);
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
  expect(await readSimulationColors()).toEqual(directColors);
  expect(await readSimulationTypography(page)).toEqual(directTypography);
});

async function readSimulationTypography(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const title = document.querySelector('.simulation-title-input');
    const body = document.querySelector('.rich-text-surface');
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
