import { gunzipSync } from 'node:zlib';
import { expect, test, type Page, type Request } from '@playwright/test';
import { feedbackSurveyFixture } from '../../src/test/feedbackSurveyFixture';
import { mockAuthenticatedLibrary, prepareEditorPage } from './editorTestHarness';

// Runs against the dev server started with a test PostHog configuration (see
// the `feedback` projects in playwright.config.ts). PostHog itself is never
// contacted: its API host is fulfilled locally.
const postHogHost = 'https://eu.i.posthog.com';
const surveyId = 'survey-e2e';

interface SentEvent {
  event: string;
  properties: Record<string, unknown>;
}

function isSentEvent(value: unknown): value is SentEvent {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'event') === 'string'
  );
}

function decodeBatch(request: Request): SentEvent[] {
  const body = request.postDataBuffer();
  if (body === null) {
    return [];
  }
  const text =
    body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString('utf8') : body.toString();
  const parsed: unknown = JSON.parse(text);
  const batch: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'batch') : undefined;
  return Array.isArray(batch) ? batch.filter(isSentEvent) : [];
}

async function mockPostHog(page: Page) {
  // posthog-js drops every event from automated browsers (`navigator.webdriver`)
  // before `before_send`. Present the test browser as an ordinary one instead
  // of weakening the production configuration.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  });
  const thirdPartyRequests: string[] = [];
  const events: SentEvent[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.protocol.startsWith('http')) {
      thirdPartyRequests.push(`${url.origin}${url.pathname}`);
    }
  });
  await page.route(`${postHogHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/surveys')) {
      await route.fulfill({ json: { surveys: [feedbackSurveyFixture(surveyId)] } });
      return;
    }
    events.push(...decodeBatch(route.request()));
    await route.fulfill({ json: { status: 1 } });
  });
  return { events, thirdPartyRequests };
}

function survey(page: Page) {
  return page.locator('.ph-survey');
}

test('opens the PostHog survey only on request and sends a minimal response', async ({ page }) => {
  const postHog = await mockPostHog(page);
  await prepareEditorPage(page);
  await page.goto('/stories/story-1/edit');
  const feedback = page.getByRole('button', { name: 'Give feedback' });
  await expect(feedback).toBeVisible();
  await page.waitForTimeout(500);
  expect(postHog.thirdPartyRequests).toEqual([]);

  await feedback.click();
  await expect(survey(page).getByText('What kind of feedback?')).toBeVisible();
  await survey(page).getByText('Bug', { exact: true }).click();
  await survey(page).getByRole('button', { name: 'Submit survey' }).click();
  await expect(page.getByText('Thank you, your feedback was sent.')).toBeAttached();
  await expect(survey(page).getByText('Thank you!')).toBeVisible();

  await expect.poll(() => postHog.events.map(({ event }) => event)).toContain('survey sent');
  const answer = postHog.events.find(({ event }) => event === 'survey sent');
  expect(answer?.properties).toMatchObject({
    $survey_id: surveyId,
    $current_url: '/stories/:storyId/edit',
    paralleax_route: '/stories/:storyId/edit',
    paralleax_surface: 'editor',
    paralleax_language: 'en',
    $geoip_disable: true,
  });
  expect(JSON.stringify(postHog.events)).not.toMatch(
    /story-1|Test story|author@example\.com|user-1|\$session_id|\$referrer|\$browser/,
  );
  expect(new Set(postHog.events.map(({ event }) => event))).toEqual(
    new Set(['survey shown', 'survey sent']),
  );
  expect(new Set(postHog.thirdPartyRequests)).toEqual(
    new Set([`${postHogHost}/api/surveys/`, `${postHogHost}/e/`]),
  );
});

test('reopens the survey after closing it and follows the interface language', async ({ page }) => {
  await mockPostHog(page);
  await mockAuthenticatedLibrary(page);
  await page.goto('/');
  const feedback = page.getByRole('button', { name: 'Give feedback' });

  await feedback.click();
  await expect(survey(page).getByText('What kind of feedback?')).toBeVisible();
  await survey(page).getByRole('button', { name: 'Close survey' }).click();
  await expect(survey(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'en Language' }).click();
  await page.getByRole('radio', { name: 'fr Français' }).click();
  await page.getByRole('button', { name: 'Donner un retour' }).click();
  await expect(survey(page).getByText('Quel type de retour ?')).toBeVisible();
  await survey(page).getByRole('button', { name: 'Close survey' }).click();
  await expect(survey(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'fr Langue' }).click();
  await page.getByRole('radio', { name: 'it Italiano' }).click();
  await page.getByRole('button', { name: 'Dai un feedback' }).click();
  await expect(survey(page).getByText('Che tipo di feedback?')).toBeVisible();
  // The popover fits the viewport, including on a phone.
  await expect(survey(page)).toBeInViewport({ ratio: 1 });
});

test('keeps Paralleax usable when PostHog is unreachable', async ({ page }) => {
  await page.route(`${postHogHost}/**`, (route) => route.abort('blockedbyclient'));
  await mockAuthenticatedLibrary(page);
  await page.goto('/');

  const feedback = page.getByRole('button', { name: 'Give feedback' });
  await feedback.click();
  await expect(page.getByText('The feedback form is unavailable. Try again later.')).toBeAttached();
  await expect(survey(page)).toHaveCount(0);
  await expect(feedback).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
});
