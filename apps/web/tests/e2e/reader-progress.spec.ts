import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ReaderProgressState, Story } from '@paralleax/shared';
import { mockRuntimeStory } from './editorTestHarness';

test('resumes and updates authenticated reader progress', async ({ page }) => {
  const story = readerStoryFixture();
  const savedState = readerProgressFixture();
  const savedInputs: Array<{
    journeyInteractionIds: string[];
    ownedItemIds: string[];
    randomSeed: string;
    stepStartedAt: string[];
  }> = [];

  await mockSignedInReader(page);
  await page.route('**/api/stories/story-1/progress', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { progress: { state: savedState, updatedAt: '2026-07-27T09:15:00.000Z' } },
      });
      return;
    }
    expect(route.request().method()).toBe('PATCH');
    const input = route.request().postDataJSON() as {
      journeyInteractionIds: string[];
      ownedItemIds: string[];
      randomSeed: string;
      stepStartedAt: string[];
    };
    savedInputs.push(input);
    await route.fulfill({
      json: {
        state: {
          ...savedState,
          version: 4,
          journeyInteractionIds: input.journeyInteractionIds,
          currentInteractionId: input.journeyInteractionIds.at(-1) ?? null,
          visitedInteractionIds: input.journeyInteractionIds,
          randomSeed: input.randomSeed,
          stepStartedAt: input.stepStartedAt,
        },
        updatedAt: '2026-07-27T09:45:00.000Z',
      },
    });
  });
  await mockRuntimeStory(page, story);

  await page.goto('/stories/story-1/play');

  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('2026-07-27 09:15')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Continue' })).toBeVisible();
  await expect
    .poll(() => savedInputs.at(-1))
    .toEqual({
      journeyInteractionIds: ['start', 'next'],
      ownedItemIds: [],
      randomSeed: expect.any(String),
      stepStartedAt: [expect.any(String), expect.any(String), expect.any(String)],
    });
  await expect(page.getByText('Progress saved')).toBeVisible();
});

test('retries a temporary reader bootstrap failure without reloading the browser', async ({
  page,
}) => {
  const story = readerStoryFixture();
  await mockSignedInReader(page);
  await page.route('**/api/stories/story-1/progress', (route) =>
    route.fulfill({ json: { progress: null } }),
  );
  let bootstrapRequests = 0;
  let bootstrapUnavailable = true;
  await mockRuntimeStory(page, story, {
    bootstrapFailure: () => {
      bootstrapRequests += 1;
      return bootstrapUnavailable
        ? { status: 503, message: 'Temporary runtime failure' }
        : undefined;
    },
  });

  await page.goto('/stories/story-1/play');

  await expect(page.getByRole('alert')).toContainText('Temporary runtime failure');
  const failedBootstrapRequests = bootstrapRequests;
  bootstrapUnavailable = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: /Start the story/ })).toBeVisible();
  expect(bootstrapRequests).toBeGreaterThan(failedBootstrapRequests);
});

test('keeps the reader open when navigation is rejected during an unresolved autosave', async ({
  page,
}) => {
  const story = readerStoryFixture();
  const savedState = readerProgressFixture();
  let markSaveStarted = () => {};
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  let releaseSave = () => {};
  const saveRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await mockSignedInReader(page);
  await page.route('**/api/stories/story-1/progress', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { progress: null } });
      return;
    }
    const input = route.request().postDataJSON() as {
      journeyInteractionIds: string[];
      ownedItemIds: string[];
      randomSeed: string;
      stepStartedAt: string[];
    };
    markSaveStarted();
    await saveRelease;
    await route.fulfill({
      json: {
        state: {
          ...savedState,
          version: 4,
          journeyInteractionIds: input.journeyInteractionIds,
          currentInteractionId: input.journeyInteractionIds.at(-1) ?? null,
          visitedInteractionIds: input.journeyInteractionIds,
          ownedItemIds: input.ownedItemIds,
          randomSeed: input.randomSeed,
          stepStartedAt: input.stepStartedAt,
        },
        updatedAt: '2026-07-27T09:16:00.000Z',
      },
    });
  });
  await mockRuntimeStory(page, story);

  await page.goto('/stories/story-1/play');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await saveStarted;

  const dialogPromise = page.waitForEvent('dialog');
  const navigationPromise = page.getByRole('link', { name: 'Stories', exact: true }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe(
    'This story still has unsaved changes. Leave this page and discard them?',
  );
  await dialog.dismiss();
  await navigationPromise;

  await expect(page).toHaveURL('/stories/story-1/play');
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();

  releaseSave();
  await expect(page.getByText('Progress saved')).toBeVisible();
});

async function mockSignedInReader(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'reader@example.com',
        createdAt: '2026-07-27T08:00:00.000Z',
      },
    }),
  );
}

function readerStoryFixture(): Story {
  return {
    id: 'story-1',
    title: 'Saved journey',
    startDateTime: '2026-07-27T09:00',
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
    interactions: [
      {
        id: 'start',
        title: 'Start',
        body: 'The beginning.',
        position: { x: 0, y: 0 },
        durationMinutes: 15,
        triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'next',
        title: 'Continue',
        body: 'The next scene.',
        position: { x: 0, y: 140 },
        durationMinutes: 30,
        triggers: [{ id: 'trigger-next', inputInteractionIds: ['start'], conditions: [] }],
      },
    ],
  };
}

function readerProgressFixture(): ReaderProgressState {
  return {
    version: 1,
    journeyInteractionIds: ['start'],
    currentInteractionId: 'start',
    visitedInteractionIds: ['start'],
    currentDateTime: '2026-07-27T09:15',
    currentLocationId: null,
    statValues: {},
    ownedItemIds: [],
  };
}
