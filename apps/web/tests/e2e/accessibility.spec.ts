import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockRuntimeStory, paginated, prepareEditorPage, story } from './editorTestHarness';

test.describe('automated accessibility', () => {
  test('keeps the Story library and its creation and import dialogs free of WCAG A/AA violations', async ({
    page,
  }) => {
    await mockAuthenticatedLibrary(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();

    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: 'New story' }).click();
    await expect(page.getByRole('dialog', { name: 'Create a story' })).toBeVisible();
    const storyTitle = page.getByLabel('Story title');
    await expect(storyTitle).toBeFocused();
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
    await expectNoWcagViolations(page);
    await page.keyboard.press('Escape');
    await expect(importButton).toBeFocused();
  });

  test('keeps the loaded Story Editor free of WCAG A/AA violations', async ({ page }) => {
    await prepareEditorPage(page);
    await page.goto('/stories/story-1/edit');
    await expect(page.getByText('Original title', { exact: true })).toBeVisible();

    await expectNoWcagViolations(page);
  });

  test('keeps the loaded Story Player and save dialog free of WCAG A/AA violations', async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 'user-1',
          email: 'reader@example.com',
          createdAt: '2026-07-27T08:00:00.000Z',
        },
      }),
    );
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
    await expect(page.getByRole('dialog', { name: 'Manage saves' })).toBeVisible();
    await expect(page.getByLabel('Save name')).toBeFocused();
    await expectNoWcagViolations(page);
    await page.keyboard.press('Escape');
    await expect(savesButton).toBeFocused();
  });
});

async function mockAuthenticatedLibrary(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'author@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    }),
  );
  await page.route(/\/api\/stories(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: paginated([
        {
          id: story.id,
          title: story.title,
          interactionCount: story.interactions.length,
          access: story.access,
          capabilities: story.capabilities,
          owner: { id: 'user-1', email: 'author@example.com' },
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
