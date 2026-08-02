import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryPlayer } from './StoryPlayer';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getStory: vi.fn(),
    getReaderProgress: vi.fn(),
    saveReaderProgress: vi.fn(),
    deleteReaderProgress: vi.fn(),
    createInteraction: vi.fn(),
    updateInteraction: vi.fn(),
  },
}));

const story: Story = {
  id: 'story-1',
  title: 'Playable story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'start',
      title: 'Start',
      body: 'You arrive.',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'next',
      title: 'Next',
      body: 'You continue.',
      position: { x: 100, y: 0 },
      triggers: [{ id: 'trigger-next', inputInteractionIds: ['start'], conditions: [] }],
    },
    {
      id: 'hidden',
      title: 'Secret',
      body: 'You found a secret.',
      position: { x: 200, y: 0 },
      triggers: [
        {
          id: 'trigger-hidden',
          inputInteractionIds: ['next'],
          conditions: [{ interactionId: 'start', hasBeenVisited: true }],
        },
      ],
    },
  ],
};

async function renderPlayer(initialEntry = '/stories/story-1/play', storyFixture = story) {
  vi.mocked(api.getStory).mockResolvedValue(structuredClone(storyFixture));
  vi.mocked(api.getReaderProgress).mockResolvedValue(null);
  vi.mocked(api.saveReaderProgress).mockResolvedValue({
    state: {
      version: 1,
      journeyInteractionIds: [],
      currentInteractionId: null,
      visitedInteractionIds: [],
      currentDateTime: '2000-01-03T08:00',
      currentLocationId: null,
      statValues: {},
      ownedItemIds: [],
    },
    updatedAt: '2026-07-27T09:00:00.000Z',
  });
  vi.mocked(api.deleteReaderProgress).mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Playable story');
}

describe('StoryPlayer', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads a story and follows available choices', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('You arrive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(api.saveReaderProgress).toHaveBeenCalledWith('story-1', {
      journeyInteractionIds: ['start'],
      ownedItemIds: [],
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('projects conditional body text from outgoing trigger availability', async () => {
    const user = userEvent.setup();
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[0].body =
      '<p>Always shown</p>' +
      '<div data-conditional-text-target="next"><button data-conditional-text-link="next">Next</button><p>Available clue</p></div>' +
      '<div data-conditional-text-target="hidden"><button data-conditional-text-link="hidden">Secret</button><p>Disconnected clue</p></div>';

    await renderPlayer('/stories/story-1/play', conditionalStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Available clue')).toBeInTheDocument();
    expect(screen.queryByText('Disconnected clue')).not.toBeInTheDocument();
  });

  it('keeps unavailable conditional text visible with an explanation in simulation', async () => {
    const user = userEvent.setup();
    const conditionalStory = structuredClone(story);
    conditionalStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'hidden', hasBeenVisited: true },
    ];
    conditionalStory.interactions[0].body =
      '<div data-conditional-text-target="next"><button aria-label="Open target interaction: Next" data-conditional-text-link="next">Next</button><p>Unavailable clue</p></div>';

    await renderPlayer('/stories/story-1/play?mode=simulation', conditionalStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Unavailable clue').closest('.conditional-text')).toHaveClass(
      'conditional-text-unavailable',
    );
    expect(screen.getByText(/Requires "Secret" to be visited/)).toBeInTheDocument();
    const unavailableOption = screen.getByRole('button', {
      name: /^NextRequires "Secret" to be visited\./,
    });
    expect(unavailableOption).toHaveClass('choice', 'unavailable');
    expect(unavailableOption).toHaveAttribute('title', 'Requires "Secret" to be visited.');
  });

  it('shows conditions on hover for available simulation options', async () => {
    const user = userEvent.setup();
    const conditionedStory = structuredClone(story);
    conditionedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'start', hasBeenVisited: true },
    ];

    await renderPlayer('/stories/story-1/play?mode=simulation', conditionedStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute(
      'title',
      '"Start" has been visited',
    );
  });

  it('renders sanitized rich text and media in the reader', async () => {
    const user = userEvent.setup();
    const richStory = structuredClone(story);
    richStory.interactions[0].body =
      '<p>A <strong>rich</strong> opening.</p><img src="https://media.example/opening.gif"><script>alert(1)</script>';
    await renderPlayer('/stories/story-1/play', richStory);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('rich').tagName).toBe('STRONG');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/opening.gif');
    expect(document.querySelector('script')).toBeNull();
  });

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

  it('obtains and loses item instances while saving the derived inventory', async () => {
    const user = userEvent.setup();
    const itemStory = structuredClone(story);
    itemStory.statDefinitions = [{ id: 'durability', name: 'Durability' }];
    itemStory.itemDefinitions = [
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ statDefinitionId: 'durability', initialValue: 10 }],
      },
    ];
    itemStory.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [{ id: 'key-1', itemDefinitionId: 'key-definition' }],
      },
    ];
    itemStory.interactions[0].itemEffects = [{ itemId: 'key-1', operation: 'obtain' }];
    itemStory.interactions[0].itemStatEffects = [
      {
        itemId: 'key-1',
        statDefinitionId: 'durability',
        operation: 'add',
        value: -2,
      },
    ];
    itemStory.interactions[1].itemEffects = [{ itemId: 'key-1', operation: 'lose' }];

    await renderPlayer('/stories/story-1/play', itemStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('Key');
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('Mira');
    expect(api.saveReaderProgress).toHaveBeenLastCalledWith('story-1', {
      journeyInteractionIds: ['start'],
      ownedItemIds: ['key-1'],
    });
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent(
      'Durability: 8',
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('No items.');
    expect(api.saveReaderProgress).toHaveBeenLastCalledWith('story-1', {
      journeyInteractionIds: ['start', 'next'],
      ownedItemIds: [],
    });
  });

  it('shows an ending and can restart', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Secret' }));

    expect(screen.getByRole('heading', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('End of this branch.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('can start from a specific interaction', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?startInteractionId=next');

    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('You continue.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Start the story/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('You continue.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current interaction title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current interaction content')).not.toBeInTheDocument();
  });

  it('shows unavailable interactions in simulation mode and lets authors force them', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    expect(screen.getByText('Simulation')).toBeInTheDocument();
    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Secret/ })).toHaveClass('unavailable');
    expect(screen.getByText('Requires "Start" to be visited.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Secret/ }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Secret');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText('End of this branch.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: /Secret/ })).toHaveClass('unavailable');
    expect(screen.getByText('Requires "Start" to be visited.')).toBeInTheDocument();
  });

  it('edits the current title and content inline in simulation mode', async () => {
    const user = userEvent.setup();
    const renamed = structuredClone(story);
    renamed.interactions[1].title = 'Renamed step';
    const rewritten = structuredClone(renamed);
    rewritten.interactions[1].body = 'Rewritten content.';
    vi.mocked(api.updateInteraction)
      .mockResolvedValueOnce(renamed)
      .mockResolvedValueOnce(rewritten);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    const titleInput = screen.getByLabelText('Current interaction title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed step');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      title: 'Renamed step',
    });
    expect(await screen.findByDisplayValue('Renamed step')).toBeInTheDocument();

    const bodyInput = screen.getByLabelText('Current interaction content');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Rewritten content.');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      body: 'Rewritten content.',
    });
    expect(screen.getByLabelText('Current interaction content')).toHaveTextContent(
      'Rewritten content.',
    );
  });

  it('adds an option in simulation mode and focuses its title', async () => {
    const user = userEvent.setup();
    const withOption = structuredClone(story);
    withOption.interactions.push({
      id: 'option-1',
      title: 'New option',
      body: '',
      position: { x: 300, y: 0 },
      triggers: [{ id: 'trigger-option-1', inputInteractionIds: ['next'], conditions: [] }],
    });
    const renamedOption = structuredClone(withOption);
    renamedOption.interactions[3].title = 'Ask the guard';
    vi.mocked(api.createInteraction).mockResolvedValue(withOption);
    vi.mocked(api.updateInteraction).mockResolvedValue(renamedOption);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');
    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'next',
      position: { x: 100, y: 132 },
    });
    const optionTitleInput = await screen.findByLabelText('New option title');
    expect(optionTitleInput).toHaveFocus();
    expect(optionTitleInput).toHaveValue('New option');

    await user.clear(optionTitleInput);
    await user.type(optionTitleInput, 'Ask the guard{Enter}');

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'option-1', {
      title: 'Ask the guard',
    });
    expect(await screen.findByRole('button', { name: 'Ask the guard' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ask the guard' }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Ask the guard');
    expect(screen.getByLabelText('Current interaction content')).toBeEmptyDOMElement();
  });

  it('adds an option from a newly created option without a stored position', async () => {
    const user = userEvent.setup();
    const withOption = structuredClone(story);
    withOption.interactions.push({
      id: 'option-1',
      title: 'New option',
      body: '',
      position: { x: 300, y: 0 },
      triggers: [{ id: 'trigger-option-1', inputInteractionIds: ['next'], conditions: [] }],
    });
    delete (withOption.interactions[3] as Partial<(typeof withOption.interactions)[number]>)
      .position;
    const withNestedOption = structuredClone(withOption);
    withNestedOption.interactions.push({
      id: 'option-2',
      title: 'Nested option',
      body: '',
      position: { x: 80, y: 648 },
      triggers: [{ id: 'trigger-option-2', inputInteractionIds: ['option-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withOption)
      .mockResolvedValueOnce(withNestedOption);
    vi.mocked(api.updateInteraction).mockResolvedValue(withOption);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.keyboard('{Enter}');

    await user.click(await screen.findByRole('button', { name: 'New option' }));
    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'option-1',
      position: { x: 80, y: 648 },
    });
    expect(await screen.findByLabelText('New option title')).toHaveValue('Nested option');
  });

  it('adds a root option at the beginning of simulation mode', async () => {
    const user = userEvent.setup();
    const withRoot = structuredClone(story);
    withRoot.interactions.push({
      id: 'root-2',
      title: 'New option',
      body: '',
      position: { x: 0, y: 132 },
      triggers: [{ id: 'trigger-root-2', inputInteractionIds: [], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withRoot);

    await renderPlayer('/stories/story-1/play?mode=simulation');

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add option' })).toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: 'Start' })
        .compareDocumentPosition(screen.getByRole('button', { name: 'Add option' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      position: { x: 0, y: 132 },
    });
    const optionTitleInput = await screen.findByLabelText('New option title');
    expect(optionTitleInput).toHaveFocus();
    expect(optionTitleInput).toHaveValue('New option');
  });
});
