import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedUser, paginated } from './editorTestHarness';

test('shows and downloads only the bounded preview before confirming', async ({ page }) => {
  await mockAuthenticatedUser(page);
  await page.route(/\/api\/stories(?:\?.*)?$/, (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/stories/imports/choicescript', (route) =>
    route.fulfill({
      json: {
        status: 'confirmation_required',
        importId: 'test',
        report: {
          format: 'choicescript',
          sourceFileCount: 1,
          sceneCount: 1,
          interactionCount: 1,
          convertedCommandCount: 0,
          approximatedCommandCount: 100,
          ignoredCommandCount: 0,
          warningCount: 100,
          errorCount: 0,
          issues: [{ severity: 'warning', code: 'approximation', message: 'Example warning' }],
        },
      },
    }),
  );
  await page.goto('/stories');
  await page.getByRole('button', { name: 'Import a story' }).click();
  await page.getByLabel('ChoiceScript scene files').setInputFiles({
    name: 'startup.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('*finish'),
  });
  await page.getByRole('button', { name: 'Import story' }).click();
  await expect(page.getByText('Warning: Example warning')).toBeVisible();
  await expect(page.getByText(/complete report cannot be downloaded/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm import' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download preview' }).click();
  expect((await download).suggestedFilename()).toBe('choicescript-import-report.jsonl');
});

async function mockImportRetry(page: Page) {
  let attempts = 0;
  await page.route('**/api/stories/imports/choicescript', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 400,
        json: {
          code: 'STORY_IMPORT_FAILED',
          message: 'Import failed',
          details: {
            report: {
              format: 'choicescript',
              sourceFileCount: 1,
              sceneCount: 1,
              interactionCount: 0,
              convertedCommandCount: 0,
              approximatedCommandCount: 0,
              ignoredCommandCount: 0,
              warningCount: 0,
              errorCount: 1,
              issues: [{ severity: 'error', code: 'missing_target', message: 'Missing target' }],
            },
          },
        },
      });
    } else {
      await route.fulfill({
        json: {
          status: 'confirmation_required',
          importId: 'retry',
          report: {
            format: 'choicescript',
            sourceFileCount: 1,
            sceneCount: 1,
            interactionCount: 1,
            convertedCommandCount: 0,
            approximatedCommandCount: 1,
            ignoredCommandCount: 0,
            warningCount: 1,
            errorCount: 0,
            issues: [{ severity: 'warning', code: 'approximation', message: 'Approximation' }],
          },
        },
      });
    }
  });
  return () => attempts;
}

test('allows a new import after a failed request', async ({ page }) => {
  await mockAuthenticatedUser(page);
  await page.route(/\/api\/stories(?:\?.*)?$/, (route) => route.fulfill({ json: paginated([]) }));
  const attempts = await mockImportRetry(page);
  await page.goto('/stories');
  await page.getByRole('button', { name: 'Import a story' }).click();
  await page
    .getByLabel('ChoiceScript scene files')
    .setInputFiles({ name: 'startup.txt', mimeType: 'text/plain', buffer: Buffer.from('*finish') });
  await page.getByRole('button', { name: 'Import story' }).click();
  await expect(page.getByText('Error: Missing target')).toBeVisible();
  await page.getByRole('button', { name: 'Import story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the import report' })).toBeVisible();
  expect(attempts()).toBe(2);
});
