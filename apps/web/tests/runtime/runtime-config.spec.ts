import { expect, test } from '@playwright/test';
import { mockAuthenticatedLibrary } from '../e2e/editorTestHarness';

for (const failure of ['empty', 'unavailable'] as const) {
  test(`an ${failure} configuration starts without feedback or telemetry`, async ({ page }) => {
    const external: string[] = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') {
        external.push(url.origin);
        await route.abort();
      } else {
        await route.fallback();
      }
    });
    await page.route('**/runtime-config.json', (route) =>
      failure === 'empty' ? route.fulfill({ json: {} }) : route.abort(),
    );
    await mockAuthenticatedLibrary(page);
    await page.goto('/stories');
    await expect(page.getByText('Test story')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Give feedback' })).toHaveCount(0);
    expect(external).toEqual([]);
  });
}

test('a configured environment enables feedback without contacting production', async ({
  page,
}) => {
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external.push(url.origin);
      await route.abort();
    } else {
      await route.fallback();
    }
  });
  await page.route('**/runtime-config.json', (route) =>
    route.fulfill({
      json: {
        posthogProjectToken: 'phc_test_token',
        posthogApiHost: 'https://feedback.example',
        posthogFeedbackSurveyId: 'survey-test',
      },
    }),
  );
  await mockAuthenticatedLibrary(page);
  await page.goto('/stories');
  await expect(page.getByRole('button', { name: 'Give feedback' })).toBeVisible();
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'Give feedback' }).click();
  await expect.poll(() => external.length).toBeGreaterThan(0);
  expect(external.every((origin) => origin === 'https://feedback.example')).toBe(true);
});
