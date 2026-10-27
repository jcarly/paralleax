import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Story } from '@paralleax/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPlayer, setupStoryPlayerTestSuite, story } from '../test/storyPlayerTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

setupStoryPlayerTestSuite();
const viewTransitionDescriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

afterEach(() => {
  if (viewTransitionDescriptor) {
    Object.defineProperty(document, 'startViewTransition', viewTransitionDescriptor);
  } else {
    Reflect.deleteProperty(document, 'startViewTransition');
  }
});

describe('Reader pass-through presentation', () => {
  it('keeps an automatically passed interaction out of transition frames', async () => {
    const user = userEvent.setup();
    const visibleCards = recordVisibleCards();
    await renderPlayer('/stories/story-1/play', createPassThroughStory());

    await user.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Next' })).not.toBeInTheDocument();
    expect(visibleCards).toEqual(['Start']);
  });
});

describe('Simulation interaction presentation', () => {
  it('cross-fades forward navigation and backward steps', async () => {
    const user = userEvent.setup();
    const visibleCards = recordVisibleCards();
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=start');

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByDisplayValue('Next')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByDisplayValue('Start')).toBeInTheDocument();
    expect(visibleCards).toEqual(['Next', 'Start']);
  });
});

function createPassThroughStory(): Story {
  const passThroughStory = structuredClone(story);
  passThroughStory.startDateTime = '2026-07-27T09:00';
  passThroughStory.locations = [{ id: 'harbor', name: 'Harbor', description: '' }];
  passThroughStory.statDefinitions = [
    { id: 'score-definition', name: 'Score', valueType: 'number' },
  ];
  passThroughStory.stats = [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 0 }];
  passThroughStory.interactions[1] = {
    ...passThroughStory.interactions[1],
    body: '<div data-conditional-text-block="hidden-only"><p>Hidden text</p></div>',
    conditionalTextBlocks: [
      {
        id: 'hidden-only',
        conditions: [{ interactionId: 'hidden', hasBeenVisited: true }],
      },
    ],
    durationMinutes: 60,
    locationId: 'harbor',
    statEffects: [{ statId: 'score', operation: 'set', value: 3 }],
  };
  passThroughStory.interactions[2].triggers[0].conditions = [
    { statId: 'score', operator: 'gte', value: 3 },
    { locationId: 'harbor', isCurrentLocation: true },
  ];
  return passThroughStory;
}

function recordVisibleCards(): string[] {
  const visibleCards: string[] = [];
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => void) => {
      update();
      const card = document.querySelector('.player-card');
      if (card?.classList.contains('player-card-passing')) {
        return {};
      }
      const title =
        document.querySelector<HTMLInputElement>('.simulation-title-input')?.value ??
        document.querySelector('.player-story-content > h1')?.textContent ??
        '';
      visibleCards.push(title);
      return {};
    },
  });
  return visibleCards;
}
