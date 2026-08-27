import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  api,
  renderPlayer,
  setupStoryPlayerTestSuite,
  story,
} from '../test/storyPlayerTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

describe('StoryPlayer runtime state', () => {
  setupStoryPlayerTestSuite();

  it('resumes a saved reader journey with materialized state', async () => {
    vi.mocked(api.getReaderProgress).mockResolvedValueOnce({
      state: {
        version: 1,
        journeyInteractionIds: ['start'],
        currentInteractionId: 'start',
        visitedInteractionIds: ['start'],
        currentDateTime: '2000-01-03T08:00',
        currentLocationId: null,
        statValues: {},
        ownedItemIds: ['key-1'],
      },
      updatedAt: '2026-07-27T09:00:00.000Z',
    });

    await renderPlayer();

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('Progress saved')).toBeInTheDocument();
  });

  it('deletes saved progress when restarting', async () => {
    const user = userEvent.setup();
    await renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(api.deleteReaderProgress).toHaveBeenCalledWith('story-1');
    expect(screen.getByRole('heading', { name: 'Start the story' })).toBeInTheDocument();
  });

  it('reports a reader progress save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaderProgress).mockRejectedValueOnce(new Error('offline'));
    await renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('Progress save failed')).toBeInTheDocument();
  });

  it('keeps author simulation isolated from reader progress', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(api.getReaderProgress).not.toHaveBeenCalled();
    expect(api.saveReaderProgress).not.toHaveBeenCalled();
    expect(api.deleteReaderProgress).not.toHaveBeenCalled();
  });

  it('replays item effects when simulation starts from an interaction', async () => {
    const itemStory = structuredClone(story);
    itemStory.characters = [{ id: 'mira', name: 'Mira', description: '', isPlayable: true }];
    itemStory.itemDefinitions = [{ id: 'key', name: 'Key', description: '' }];
    itemStory.interactions[1].itemEffects = [
      { itemDefinitionId: 'key', characterId: 'mira', operation: 'obtain' },
    ];

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next', itemStory);

    expect(screen.getByText('Key')).toBeInTheDocument();
  });

  it('advances the story clock before evaluating temporal choices', async () => {
    const user = userEvent.setup();
    const timedStory = structuredClone(story);
    timedStory.startDateTime = '2026-07-27T09:00';
    timedStory.interactions[0].durationMinutes = 60;
    timedStory.interactions[1].triggers[0].conditions = [
      {
        temporal: {
          weekdays: ['monday'],
          timeSlots: [{ startTime: '10:00', endTime: '11:00' }],
        },
      },
    ];

    await renderPlayer('/stories/story-1/play', timedStory);
    expect(screen.getByText('2026-07-27 09:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('2026-07-27 10:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('updates and preserves current location while evaluating choices', async () => {
    const user = userEvent.setup();
    const locatedStory = structuredClone(story);
    locatedStory.locations = [{ id: 'harbor', name: 'Harbor', description: '' }];
    locatedStory.interactions[0].locationId = 'harbor';
    locatedStory.interactions[2].triggers[0].conditions = [
      { locationId: 'harbor', isCurrentLocation: true },
    ];

    await renderPlayer('/stories/story-1/play', locatedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Harbor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
  });

  it('evaluates character conditions from the current interaction cast', async () => {
    const user = userEvent.setup();
    const characterStory = structuredClone(story);
    characterStory.characters = [{ id: 'mira', name: 'Mira', description: '' }];
    characterStory.interactions[0].characterIds = ['mira'];
    characterStory.interactions[1].triggers[0].conditions = [
      { characterId: 'mira', isPresent: true },
    ];

    await renderPlayer('/stories/story-1/play', characterStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('selects the playable character and shows player and encounter panels', async () => {
    const user = userEvent.setup();
    const characterStory = structuredClone(story);
    characterStory.statDefinitions = [{ id: 'trust-definition', name: 'Trust' }];
    characterStory.characters = [
      {
        id: 'player',
        name: 'Ari',
        description: 'The protagonist.',
        imageUrl: 'https://images.example/ari.png',
        isPlayable: true,
        stats: [{ id: 'trust', statDefinitionId: 'trust-definition', initialValue: 4 }],
      },
      {
        id: 'mira',
        name: 'Mira',
        description: 'A new acquaintance.',
        imageUrl: 'https://images.example/mira.png',
      },
    ];
    characterStory.interactions[0].characterIds = ['mira'];

    await renderPlayer('/stories/story-1/play', characterStory);
    expect(screen.getByRole('heading', { name: 'Choose your character' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ari/ }));
    expect(screen.getByRole('complementary', { name: 'Played character' })).toHaveTextContent(
      'Trust: 4',
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('complementary', { name: 'Encountered characters' })).toHaveTextContent(
      'Mira',
    );
  });

  it('hides location-blocked options in simulation mode', async () => {
    const user = userEvent.setup();
    const locatedStory = structuredClone(story);
    locatedStory.locations = [{ id: 'harbor', name: 'Harbor', description: '' }];
    locatedStory.interactions[1].triggers[0].conditions = [
      { locationId: 'harbor', isCurrentLocation: true },
    ];

    await renderPlayer('/stories/story-1/play?mode=simulation', locatedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('applies time-based and explicit stat changes before evaluating choices', async () => {
    const user = userEvent.setup();
    const statStory = structuredClone(story);
    statStory.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'trust', statDefinitionId: 'trust-definition', initialValue: 1 }],
      },
    ];
    statStory.statDefinitions = [{ id: 'trust-definition', name: 'Trust', changePerHour: 1 }];
    statStory.interactions[0].durationMinutes = 60;
    statStory.interactions[0].statEffects = [{ statId: 'trust', operation: 'add', value: 1 }];
    statStory.interactions[1].triggers[0].conditions = [
      { statId: 'trust', operator: 'gte', value: 3 },
    ];

    await renderPlayer('/stories/story-1/play', statStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('replays typed variable effects for conditions and rich-text interpolation', async () => {
    const user = userEvent.setup();
    const variableStory = structuredClone(story);
    variableStory.statDefinitions = [
      { id: 'score-definition', name: 'Score', valueType: 'number' },
    ];
    variableStory.stats = [
      { id: 'score-assignment', statDefinitionId: 'score-definition', initialValue: 1 },
    ];
    variableStory.interactions[0].body =
      '<p>Score: <span data-stat-value="score-assignment"></span></p>';
    variableStory.interactions[0].statEffects = [
      { statId: 'score-assignment', operation: 'add', value: 2 },
    ];
    variableStory.interactions[1].triggers[0].conditions = [
      { statId: 'score-assignment', operator: 'gte', value: 3 },
    ];

    await renderPlayer('/stories/story-1/play', variableStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('3', { selector: '[data-stat-value]' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
