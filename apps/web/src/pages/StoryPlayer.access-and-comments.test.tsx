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

describe('StoryPlayer access and comments', () => {
  setupStoryPlayerTestSuite();

  it('obtains and loses item instances while saving the derived inventory', async () => {
    const user = userEvent.setup();
    const itemStory = structuredClone(story);
    itemStory.statDefinitions = [{ id: 'durability', name: 'Durability' }];
    itemStory.itemDefinitions = [
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ id: 'key-durability', statDefinitionId: 'durability', initialValue: 10 }],
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
    itemStory.interactions[0].statEffects = [
      {
        itemId: 'key-1',
        statId: 'key-durability',
        operation: 'add',
        value: -2,
      },
    ];
    itemStory.interactions[1].itemEffects = [{ itemId: 'key-1', operation: 'lose' }];

    await renderPlayer('/stories/story-1/play', itemStory);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('Key');
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('Mira');
    expect(api.saveReaderProgress).toHaveBeenLastCalledWith(
      'story-1',
      {
        journeyInteractionIds: ['start'],
        ownedItemIds: ['key-1'],
      },
      'reader',
    );
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent(
      'Durability: 8',
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('complementary', { name: 'Inventory' })).toHaveTextContent('No items.');
    expect(api.saveReaderProgress).toHaveBeenLastCalledWith(
      'story-1',
      {
        journeyInteractionIds: ['start', 'next'],
        ownedItemIds: [],
      },
      'reader',
    );
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

  it('ignores a direct start interaction outside simulation mode', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?startInteractionId=next');

    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
  });

  it('ignores simulation controls and direct starts for non-editors', async () => {
    const readerStory = structuredClone(story);
    readerStory.access = {
      visibility: 'authenticated',
      editPolicy: 'owner',
      commentPolicy: 'readers',
    };
    readerStory.capabilities = {
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: true,
    };

    await renderPlayer(
      '/stories/story-1/play?mode=simulation&startInteractionId=next',
      readerStory,
    );

    expect(screen.getByText('Paralleax Reader')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.queryByText('Simulation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current interaction title')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to editor' })).not.toBeInTheDocument();
    expect(api.getReaderProgress).toHaveBeenCalledWith('story-1', 'reader');
  });

  it('lets an authorized reader comment on the current scene from the reader', async () => {
    const user = userEvent.setup();
    const readerStory = structuredClone(story);
    readerStory.access = {
      visibility: 'authenticated',
      editPolicy: 'owner',
      commentPolicy: 'readers',
    };
    readerStory.capabilities = {
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: true,
    };
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      {
        id: 'current-thread',
        storyId: story.id,
        anchor: { kind: 'entity', targetType: 'interaction', targetId: 'start' },
        anchorLabel: 'Start',
        status: 'open',
        createdBy: { id: 'author-1', email: 'author@example.com' },
        createdAt: '2026-08-16T08:00:00.000Z',
        updatedAt: '2026-08-16T08:00:00.000Z',
        messages: [
          {
            id: 'current-message',
            threadId: 'current-thread',
            author: { id: 'author-1', email: 'author@example.com' },
            body: 'Current scene note.',
            createdAt: '2026-08-16T08:00:00.000Z',
          },
        ],
      },
      {
        id: 'future-thread',
        storyId: story.id,
        anchor: { kind: 'entity', targetType: 'interaction', targetId: 'next' },
        anchorLabel: 'Next',
        status: 'open',
        createdBy: { id: 'author-1', email: 'author@example.com' },
        createdAt: '2026-08-16T08:00:00.000Z',
        updatedAt: '2026-08-16T08:00:00.000Z',
        messages: [
          {
            id: 'future-message',
            threadId: 'future-thread',
            author: { id: 'author-1', email: 'author@example.com' },
            body: 'Future scene note.',
            createdAt: '2026-08-16T08:00:00.000Z',
          },
        ],
      },
    ]);
    vi.mocked(api.createCommentThread).mockResolvedValue({
      id: 'thread-1',
      storyId: story.id,
      anchor: { kind: 'entity', targetType: 'interaction', targetId: 'start' },
      anchorLabel: 'Start',
      status: 'open',
      createdBy: { id: 'reader-1', email: 'reader@example.com' },
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          author: { id: 'reader-1', email: 'reader@example.com' },
          body: 'Could this moment be clearer?',
          createdAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    });

    await renderPlayer('/stories/story-1/play', readerStory);
    expect(screen.getByRole('button', { name: 'Comments' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to editor' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: /^Comments/ }));
    expect(await screen.findByText('Current scene note.')).toBeInTheDocument();
    expect(screen.queryByText('Future scene note.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Comment on this scene' }));
    await user.type(
      screen.getByRole('complementary', { name: 'Story comments' }).querySelector('textarea')!,
      'Could this moment be clearer?',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(api.createCommentThread).toHaveBeenCalledWith(
      'story-1',
      { kind: 'entity', targetType: 'interaction', targetId: 'start' },
      'Could this moment be clearer?',
    );
  });
});
