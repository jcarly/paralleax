import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  mockAuthenticatedUser,
  mockRuntimeStory,
  paginated,
  prepareEditorPage,
  story,
} from './editorTestHarness';

test.describe('automated accessibility', () => {
  test('keeps anonymous account entry free of WCAG A/AA violations', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, json: { message: 'Authentication required' } }),
    );
    await page.route('**/api/stories/public**', (route) => route.fulfill({ json: paginated([]) }));
    await page.goto('/');

    await expect(page.getByRole('group', { name: 'Account access' })).toBeVisible();
    await expectNoWcagViolations(page);
  });

  test('keeps the Story library and its creation and import dialogs free of WCAG A/AA violations', async ({
    page,
  }) => {
    await mockAuthenticatedLibrary(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'AU Author: Account settings', exact: true }),
    ).toBeVisible();

    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: 'New story' }).click();
    await expect(page.getByRole('dialog', { name: 'Create a story' })).toBeVisible();
    const storyTitle = page.getByLabel('Story title');
    await expect(storyTitle).toBeFocused();
    await expectBackgroundIsolated(page, page.getByRole('dialog'));
    await expectNoWcagViolations(page);

    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(storyTitle).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Create a story' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'New story' })).toBeFocused();

    const importButton = page.getByRole('button', { name: 'Import a story' });
    await importButton.click();
    await expect(page.getByRole('dialog', { name: 'Import a ChoiceScript project' })).toBeVisible();
    await expect(page.getByLabel('ChoiceScript scene files')).toBeFocused();
    await expectBackgroundIsolated(page, page.getByRole('dialog'));
    await expectNoWcagViolations(page);
    await page.keyboard.press('Escape');
    await expect(importButton).toBeFocused();

    const accountButton = page.getByRole('button', { name: 'Account settings' });
    await accountButton.click();
    await expectBackgroundIsolated(page, page.getByRole('dialog', { name: 'Account settings' }));
    await page.keyboard.press('Escape');
    await expect(accountButton).toBeFocused();
  });

  test('keeps the loaded Story Editor free of WCAG A/AA violations', async ({ page }) => {
    await prepareEditorPage(page);
    await page.goto('/stories/story-1/edit');
    await expect(page.getByText('Original title', { exact: true })).toBeVisible();
    const nodes = page.getByTestId('interaction-node');
    await nodes.first().click();
    const nodeCount = await nodes.count();
    let deleteRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deleteRequests += 1;
    });

    await expectNoWcagViolations(page);

    const settingsButton = page.getByRole('button', { name: 'Story settings' });
    await settingsButton.click();
    await expect(page.getByRole('dialog', { name: 'Story settings' })).toBeVisible();
    await expect(page.getByLabel('Story start date and time', { exact: true })).toBeFocused();
    await expectBackgroundIsolated(page, page.getByRole('dialog'));
    await page.getByRole('button', { name: 'Close Story settings' }).focus();
    await page.keyboard.press('Delete');
    expect(deleteRequests).toBe(0);
    await expect(nodes).toHaveCount(nodeCount);
    await expectNoWcagViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Story settings' })).toBeHidden();
    await expect(settingsButton).toBeFocused();
  });

  test('keeps the loaded Story Player and save dialog free of WCAG A/AA violations', async ({
    page,
  }) => {
    await mockAuthenticatedUser(page, {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      role: 'user',
      createdAt: '2026-07-27T08:00:00.000Z',
    });
    await page.route('**/api/stories/story-1/progress', (route) =>
      route.fulfill({ json: { progress: null } }),
    );
    await page.route('**/api/stories/story-1/progress/saves', (route) =>
      route.fulfill({ json: [] }),
    );
    await mockRuntimeStory(page, story);
    await page.goto('/stories/story-1/play');
    await expect(page.getByRole('heading', { name: 'Start the story' })).toBeVisible();

    await expectNoWcagViolations(page);

    const savesButton = page.getByRole('button', { name: 'Saves' });
    await savesButton.click();
    const savesDialog = page.getByRole('dialog', { name: 'Manage saves' });
    await expect(savesDialog).toBeVisible();
    await expectBackgroundIsolated(page, savesDialog);
    await expect(page.getByLabel('Save name')).toBeFocused();
    await expectNoWcagViolations(page);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Close saves' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Save name')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close saves' })).toBeFocused();
    const accountBox = await page.locator('.product-user').boundingBox();
    if (!accountBox) throw new Error('The account control must be present behind the backdrop.');
    await page.mouse.click(
      accountBox.x + accountBox.width / 2,
      accountBox.y + accountBox.height / 2,
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert');
    await savesButton.click();
    await page.keyboard.press('Escape');
    await expect(savesButton).toBeFocused();
  });
});

async function expectBackgroundIsolated(page: Page, dialog: Locator) {
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  const account = page.locator('.product-user');
  await account.evaluate((control: HTMLElement) => control.focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const covered = await account.evaluate((control) => {
    const box = control.getBoundingClientRect();
    return Boolean(
      document
        .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        ?.closest('.modal-portal'),
    );
  });
  expect(covered).toBe(true);
}

async function mockAuthenticatedLibrary(page: Page) {
  await mockAuthenticatedUser(page);
  await page.route(/\/api\/stories(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: paginated([
        {
          id: story.id,
          title: story.title,
          interactionCount: story.interactions.length,
          access: story.access,
          capabilities: story.capabilities,
          owner: { id: 'user-1', displayName: 'Author' },
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
        },
      ]),
    }),
  );
}

async function expectNoWcagViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations
    .map(
      (violation) =>
        violation.id +
        ': ' +
        violation.help +
        '\n' +
        violation.nodes
          .map(
            (node) =>
              `- ${node.target.join(' ')}: ${node.failureSummary ?? 'No failure details available.'}`,
          )
          .join('\n'),
    )
    .join('\n');

  if (results.violations.length > 0) throw new Error(summary);
}
