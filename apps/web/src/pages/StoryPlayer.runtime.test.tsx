import { screen, waitFor } from '@testing-library/react';
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

    expect(api.deleteReaderProgress).toHaveBeenCalledWith('story-1', 'reader');
    expect(screen.getByRole('heading', { name: 'Start the story' })).toBeInTheDocument();
  });

  it('reports a reader progress save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaderProgress).mockRejectedValueOnce(new Error('offline'));
    await renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('Progress save failed')).toBeInTheDocument();
  });

  it('uses a dedicated autosave for author simulation', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(api.getReaderProgress).toHaveBeenCalledWith('story-1', 'simulation');
    expect(api.saveReaderProgress).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ journeyInteractionIds: ['start'] }),
      'simulation',
    );
    expect(api.deleteReaderProgress).toHaveBeenCalledWith('story-1', 'simulation');
  });

  it('shows failed Trigger probability rolls in simulation and allows forcing the path', async () => {
    const user = userEvent.setup();
    const probabilityStory = structuredClone(story);
    probabilityStory.interactions.push({
      id: 'rare',
      title: 'Rare path',
      body: 'A rare event.',
      position: { x: 300, y: 0 },
      triggers: [
        {
          id: 'rare-trigger',
          inputInteractionIds: ['start'],
          conditionGroups: [{ id: 'always', conditions: [] }],
          appearanceProbability: 0,
        },
      ],
    });
    await renderPlayer('/stories/story-1/play?mode=simulation', probabilityStory);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    const rare = screen.getByRole('button', { name: /Rare path/ });
    expect(rare).toBeDisabled();
    expect(screen.getByText(/0% chance; deterministic roll/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Force unavailable options/ }));
    await user.click(rare);
    expect(await screen.findByDisplayValue('Rare path')).toBeInTheDocument();
  });

  it('shows a draining bar above an available timed option', async () => {
    const user = userEvent.setup();
    const timedStory = structuredClone(story);
    timedStory.interactions[1].triggers[0].timerSeconds = 10;

    await renderPlayer('/stories/story-1/play', timedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    const timer = screen.getByRole('progressbar', {
      name: 'Time remaining for this option',
    });
    expect(timer).toHaveAttribute('aria-valuemax', '10');
    expect(timer).toHaveAttribute('aria-valuenow', '10');
  });

  it('keeps an expired option visible but disabled in simulation', async () => {
    const user = userEvent.setup();
    const timedStory = structuredClone(story);
    timedStory.interactions[1].triggers[0].timerSeconds = 0;

    await renderPlayer('/stories/story-1/play?mode=simulation', timedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByText('The Trigger timer expired after 0 seconds.')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Time remaining for this option' }),
    ).toHaveAttribute('aria-valuenow', '0');
  });

  it('autosaves an interaction used as the explicit simulation start', async () => {
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    await waitFor(() =>
      expect(api.saveReaderProgress).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({ journeyInteractionIds: ['next'] }),
        'simulation',
      ),
    );
  });

  it('restores an expired timer after stepping backward in simulation', async () => {
    const user = userEvent.setup();
    const timedStory = structuredClone(story);
    timedStory.interactions.push({
      id: 'timed-path',
      title: 'Timed path',
      body: 'Too late.',
      position: { x: 300, y: 0 },
      triggers: [
        {
          id: 'timed-path-trigger',
          inputInteractionIds: ['start'],
          conditionGroups: [{ id: 'timed-path-group', conditions: [] }],
          appearanceProbability: 100,
          timerSeconds: 1,
        },
      ],
    });

    await renderPlayer('/stories/story-1/play?mode=simulation', timedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Timed path' })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Timed path/ })).toBeDisabled(), {
      timeout: 2_000,
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: /Timed path/ })).toBeDisabled();
    expect(screen.getByText('The Trigger timer expired after 1 second.')).toBeInTheDocument();
  });

  it('loads a reader save into simulation and continues in the simulation autosave', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation');
    const updatedAt = '2026-08-27T09:00:00.000Z';
    vi.mocked(api.listReaderSaves).mockResolvedValueOnce([
      {
        id: 'reader-autosave',
        kind: 'reader-autosave',
        currentInteractionId: 'start',
        journeyLength: 1,
        createdAt: updatedAt,
        updatedAt,
      },
    ]);
    vi.mocked(api.getReaderSave).mockResolvedValueOnce({
      id: 'reader-autosave',
      kind: 'reader-autosave',
      state: {
        version: 2,
        journeyInteractionIds: ['start'],
        currentInteractionId: 'start',
        visitedInteractionIds: ['start'],
        currentDateTime: '2000-01-03T08:00',
        currentLocationId: null,
        statValues: {},
        ownedItemIds: [],
        itemStatValues: {},
      },
      createdAt: updatedAt,
      updatedAt,
    });

    await user.click(screen.getByRole('button', { name: 'Saves' }));
    expect(await screen.findByRole('dialog', { name: 'Manage saves' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load' }));

    expect(await screen.findByDisplayValue('Start')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.saveReaderProgress).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({ journeyInteractionIds: ['start'] }),
        'simulation',
      ),
    );
  });

  it('creates, overwrites, and deletes a named manual save', async () => {
    const user = userEvent.setup();
    const updatedAt = '2026-08-27T09:00:00.000Z';
    const manualSave = {
      id: 'manual-save-1',
      kind: 'manual' as const,
      name: 'Before the gate',
      state: {
        version: 2 as const,
        journeyInteractionIds: [],
        currentInteractionId: null,
        visitedInteractionIds: [],
        currentDateTime: '2000-01-03T08:00',
        currentLocationId: null,
        statValues: {},
        ownedItemIds: [],
        itemStatValues: {},
      },
      createdAt: updatedAt,
      updatedAt,
    };
    vi.mocked(api.createReaderSave).mockResolvedValueOnce(manualSave);
    vi.mocked(api.updateReaderSave).mockResolvedValueOnce({
      ...manualSave,
      updatedAt: '2026-08-27T09:05:00.000Z',
    });
    vi.mocked(api.deleteReaderSave).mockResolvedValueOnce(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Saves' }));
    await user.type(screen.getByRole('textbox', { name: 'Save name' }), 'Before the gate');
    await user.click(screen.getByRole('button', { name: 'Create save' }));

    expect(api.createReaderSave).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ name: 'Before the gate', journeyInteractionIds: [] }),
    );
    expect(await screen.findByText('Before the gate')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Overwrite' }));
    await waitFor(() =>
      expect(api.updateReaderSave).toHaveBeenCalledWith(
        'story-1',
        'manual-save-1',
        expect.objectContaining({ name: 'Before the gate', journeyInteractionIds: [] }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();
    expect(api.deleteReaderSave).toHaveBeenCalledWith('story-1', 'manual-save-1');
    expect(await screen.findByText('No save exists yet.')).toBeInTheDocument();
    confirm.mockRestore();
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
