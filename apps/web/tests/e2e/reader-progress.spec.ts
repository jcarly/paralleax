import { expect, test } from '@playwright/test';
import type { ReaderProgressState, Story } from '@paralleax/shared';

test('resumes and updates authenticated reader progress', async ({ page }) => {
  const story: Story = {
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
  const savedState: ReaderProgressState = {
    version: 1,
    journeyInteractionIds: ['start'],
    currentInteractionId: 'start',
    visitedInteractionIds: ['start'],
    currentDateTime: '2026-07-27T09:15',
    currentLocationId: null,
    statValues: {},
    ownedItemIds: [],
  };

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'reader@example.com',
        createdAt: '2026-07-27T08:00:00.000Z',
      },
    }),
  );
  await page.route('**/api/stories/story-1/progress', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { progress: { state: savedState, updatedAt: '2026-07-27T09:15:00.000Z' } },
      });
      return;
    }
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({
      journeyInteractionIds: ['start', 'next'],
      ownedItemIds: [],
    });
    await route.fulfill({
      json: {
        state: { ...savedState, journeyInteractionIds: ['start', 'next'] },
        updatedAt: '2026-07-27T09:45:00.000Z',
      },
    });
  });
  await page.route('**/api/stories/story-1', (route) => route.fulfill({ json: story }));

  await page.goto('/stories/story-1/play');

  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('2026-07-27 09:15')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('Progress saved')).toBeVisible();
});
