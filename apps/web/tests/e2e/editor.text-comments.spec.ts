import { expect, test, type Page } from '@playwright/test';
import { cloneStory, prepareEditorPage } from './editorTestHarness';

async function selectTitleWord(page: Page) {
  await page
    .locator('.inspector [data-comment-field="title"]')
    .first()
    .evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !(text.textContent?.includes('Original') ?? false)) {
        text = walker.nextNode();
      }
      if (!text) {
        throw new Error('Expected title text');
      }
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 8);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
}

test('offers the text comment action only for selected text, by pointer or keyboard', async ({
  page,
}) => {
  const story = cloneStory();
  story.capabilities = { ...story.capabilities, canComment: true };
  story.access = { ...story.access, commentPolicy: 'editors' };
  await prepareEditorPage(page, story);
  await page.goto('/stories/story-1/edit');
  await page.getByTestId('interaction-node').first().click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const action = inspector.getByRole('button', { name: 'Comment on the selected text' });
  await expect(inspector.locator('[data-comment-field="title"]')).toBeVisible();

  await expect(action).toHaveCount(0);
  await selectTitleWord(page);
  await expect(action).toBeVisible();

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await expect(action).toHaveCount(0);

  // Keyboard: the selection survives Tab to the action, and Enter opens the draft.
  await selectTitleWord(page);
  await inspector.getByRole('button', { name: 'Comment on this element' }).focus();
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Comment' })).toBeVisible();
  await expect(page.getByText('Original', { exact: false }).first()).toBeVisible();
});

test('starts a text comment from the action with the pointer', async ({ page }) => {
  const story = cloneStory();
  story.capabilities = { ...story.capabilities, canComment: true };
  await prepareEditorPage(page, story);
  await page.goto('/stories/story-1/edit');
  await page.getByTestId('interaction-node').first().click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.locator('[data-comment-field="title"]')).toBeVisible();

  await selectTitleWord(page);
  await inspector.getByRole('button', { name: 'Comment on the selected text' }).click();

  await expect(page.getByRole('textbox', { name: 'Comment' })).toBeVisible();
});
