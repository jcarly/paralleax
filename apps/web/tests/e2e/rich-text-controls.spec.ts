import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  mockRuntimeStory,
  prepareEditorPage,
  storyWithConditionCandidate,
} from './editorTestHarness';

test('keeps rich-text removal controls styled without graph CSS in Simulation and the editor', async ({
  page,
}) => {
  const story = storyWithConditionCandidate();
  story.interactions[0].body =
    '<p><span contenteditable="false" data-interaction-link-target="interaction-2">Continue</span></p>' +
    '<div data-conditional-text-block="block-1"><p>Secret clue</p></div>';
  story.interactions[0].conditionalTextBlocks = [
    {
      id: 'block-1',
      conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
    },
  ];

  await prepareEditorPage(page, story);
  await mockRuntimeStory(page, story);
  await page.route('**/api/stories/story-1/progress/simulation', (route) =>
    route.fulfill({ json: { progress: null } }),
  );

  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');
  const simulationContent = page.getByRole('textbox', { name: 'Current interaction content' });
  await expect(simulationContent).toContainText('Continue');
  await expect(simulationContent).toContainText('Secret clue');

  const simulationLinkRemove = simulationContent.locator('.rich-text-token-remove');
  const simulationConditionRemove = simulationContent.locator('.rich-text-condition-remove');
  await expect(simulationLinkRemove).toHaveCount(1);
  await expect(simulationConditionRemove).toHaveCount(1);
  await expect(simulationLinkRemove).not.toHaveClass(/trigger-link-delete/);
  await expect(simulationConditionRemove).not.toHaveClass(/trigger-link-delete/);

  const graphRemovalStylesLoaded = await page.evaluate(() =>
    Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some((rule) =>
          rule.cssText.includes('.trigger-link-delete'),
        );
      } catch {
        return false;
      }
    }),
  );
  expect(graphRemovalStylesLoaded).toBe(false);

  const simulationLinkStates = await captureRemovalStates(page, simulationLinkRemove);
  const simulationConditionStates = await captureRemovalStates(page, simulationConditionRemove);
  expect(simulationLinkStates.rest).toMatchObject({
    position: 'absolute',
    width: '18px',
    height: '18px',
    opacity: '1',
    transform: 'none',
  });
  expect(simulationLinkStates.rest.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(simulationLinkStates.focus.focusVisible).toBe(true);

  await page.goto('/stories/story-1/edit');
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  const editorContent = page.getByRole('textbox', { name: 'Content' });
  const editorLinkRemove = editorContent.locator('.rich-text-token-remove');
  const editorConditionRemove = editorContent.locator('.rich-text-condition-remove');
  await expect(editorLinkRemove).toHaveCount(1);
  await expect(editorConditionRemove).toHaveCount(1);

  expect(await captureRemovalStates(page, editorLinkRemove)).toEqual(simulationLinkStates);
  expect(await captureRemovalStates(page, editorConditionRemove)).toEqual(
    simulationConditionStates,
  );
});

async function captureRemovalStates(page: Page, button: Locator) {
  await page.mouse.move(0, 0);
  const rest = await readRemovalStyle(button);

  await button.hover();
  const hover = await readRemovalStyle(button);

  await page.keyboard.press('Tab');
  await button.focus();
  await expect(button).toBeFocused();
  const focus = await readRemovalStyle(button);

  return { rest, hover, focus };
}

async function readRemovalStyle(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      position: style.position,
      top: style.top,
      right: style.right,
      width: style.width,
      height: style.height,
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
      transform: style.transform,
      focusVisible: element.matches(':focus-visible'),
    };
  });
}
