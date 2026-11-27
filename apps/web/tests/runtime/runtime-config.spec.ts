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
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('synthetic unconfigured browser error');
      }, 0);
    });
    await page.waitForTimeout(500);
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

test('runtime Sentry initializes and sends an error to the configured project', async ({
  page,
}) => {
  const external: string[] = [];
  const envelopes: string[] = [];
  const paths: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      await route.fallback();
      return;
    }
    external.push(url.origin);
    if (url.origin === 'https://sentry-stage.example') {
      paths.push(url.pathname);
      envelopes.push(route.request().postData() ?? '');
      await route.fulfill({ status: 200, body: '' });
      return;
    }
    await route.abort();
  });
  await page.route('**/runtime-config.json', (route) =>
    route.fulfill({
      json: {
        sentryDsn: 'https://public@sentry-stage.example/42',
        sentryRelease: 'image-release-test',
      },
    }),
  );
  await mockAuthenticatedLibrary(page);
  await page.goto('/stories');
  await expect(page.getByText('Test story')).toBeVisible();
  const timer = await page.evaluate(() =>
    setInterval(() => {
      setTimeout(() => {
        throw new Error('synthetic runtime Sentry error');
      }, 0);
    }, 250),
  );
  try {
    await expect.poll(() => envelopes.length, { timeout: 15_000 }).toBeGreaterThan(0);
  } finally {
    await page.evaluate((id) => {
      clearInterval(id);
    }, timer);
  }
  expect(external.every((origin) => origin === 'https://sentry-stage.example')).toBe(true);
  expect(paths).toContain('/api/42/envelope/');
  expect(envelopes.join('')).toContain('image-release-test');
});
