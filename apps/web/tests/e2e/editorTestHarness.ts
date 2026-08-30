import type { Page } from '@playwright/test';
import type { Story, StoryGraphPositionUpdates } from '@paralleax/shared';

export const story: Story = {
  id: 'story-1',
  title: 'Test story',
  access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  capabilities: {
    canRead: true,
    canEdit: true,
    canManage: true,
    canComment: false,
  },
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Original title',
      body: 'Original content',
      position: { x: 120, y: 140 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
};

export function cloneStory() {
  return structuredClone(story);
}

export function storyWithConditionCandidate(): Story {
  const next = cloneStory();
  next.interactions.push({
    id: 'interaction-2',
    title: 'Visited scene',
    body: 'A previous scene.',
    position: { x: 120, y: 300 },
    triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
  });
  return next;
}

export function storyWithHorizontalLink(): Story {
  const next = cloneStory();
  next.interactions.push({
    id: 'interaction-2',
    title: 'Linked scene',
    body: 'A scene connected through a trigger.',
    position: { x: 680, y: 140 },
    triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
  });
  return next;
}

export async function getEdgeEndDirection(page: Page, edgeId: string) {
  return page
    .locator(`[data-id="${edgeId}"] .react-flow__edge-path`)
    .evaluate((element: SVGPathElement) => {
      const length = element.getTotalLength();
      const before = element.getPointAtLength(Math.max(0, length - 8));
      const end = element.getPointAtLength(length);
      return { dx: end.x - before.x, dy: end.y - before.y };
    });
}

export async function mockStory(page: Page, initialStory: Story = cloneStory()) {
  await page.route('**/api/stories/story-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: structuredClone(initialStory) });
      return;
    }

    await route.fallback();
  });
}

export async function mockGraphPositionUpdates(
  page: Page,
  onUpdate: (updates: StoryGraphPositionUpdates) => void | Promise<void> = () => {},
) {
  await page.route('**/api/stories/story-1/graph/positions', async (route) => {
    const updates = route.request().postDataJSON() as StoryGraphPositionUpdates;
    await onUpdate(updates);
    await route.fulfill({
      json: {
        revision: 2,
        updatedAt: '2026-07-14T08:01:00.000Z',
      },
    });
  });
}

async function mockEditorBackgroundRequests(page: Page) {
  await page.addInitScript(() => {
    class TestEventSource {
      readonly listeners = new Map<string, Array<() => void>>();
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(readonly url: string) {
        const testWindow = window as typeof window & { storyEvents?: TestEventSource[] };
        testWindow.storyEvents = [...(testWindow.storyEvents ?? []), this];
        setTimeout(() => this.onopen?.(), 0);
      }

      addEventListener(type: string, listener: () => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }

      emit(type: string) {
        this.listeners.get(type)?.forEach((listener) => listener());
      }

      close() {}
    }

    Object.defineProperty(window, 'EventSource', { configurable: true, value: TestEventSource });
  });
  await page.route('**/api/stories/story-1/comment-threads', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/stories/story-1/history', (route) =>
    route.fulfill({ json: { entries: [], canUndo: false, canRedo: false } }),
  );
  await mockGraphPositionUpdates(page);
}

export async function prepareEditorPage(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'author@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    }),
  );
  await mockEditorBackgroundRequests(page);
  await mockStory(page);
}
