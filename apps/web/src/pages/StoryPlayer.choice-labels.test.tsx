import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { renderPlayer, setupStoryPlayerTestSuite, story } from '../test/storyPlayerTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

setupStoryPlayerTestSuite();

function untitledStory(childCount: number): Story {
  return {
    ...structuredClone(story),
    interactions: [
      {
        id: 'start',
        title: '',
        body: 'You arrive.',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
      },
      ...Array.from({ length: childCount }, (_, index) => ({
        id: `child-${String(index)}`,
        title: '',
        body: 'Later.',
        position: { x: index * 100, y: 400 },
        triggers: [
          { id: `trigger-child-${String(index)}`, inputInteractionIds: ['start'], conditions: [] },
        ],
      })),
    ],
  };
}

it('reads a lone untitled choice as Continue and shows no placeholder title', async () => {
  await renderPlayer('/stories/story-1/play', untitledStory(1));

  await screen.findByText('You arrive.');
  expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  expect(screen.queryByText('New interaction')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Start' })).not.toBeInTheDocument();
});

it('numbers untitled options for readers without an authoring warning', async () => {
  await renderPlayer('/stories/story-1/play', untitledStory(2));

  expect(await screen.findByRole('button', { name: 'Option 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Option 2' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Label required/ })).not.toBeInTheDocument();
  expect(document.querySelector('.choice-label-error')).toBeNull();
});

it('flags untitled options with an empty, outlined label in Simulation', async () => {
  await renderPlayer(
    '/stories/story-1/play?mode=simulation&startInteractionId=start',
    untitledStory(2),
  );

  const errors = await screen.findAllByRole('img', { name: /Label required/ });
  expect(errors).toHaveLength(2);
  expect(screen.queryByText(/Option \d/)).not.toBeInTheDocument();
  for (const error of errors) {
    const choice = error.closest('button');
    expect(choice).toHaveClass('choice-label-error');
    expect(choice?.querySelector('.choice-copy strong')).toHaveTextContent(/^$/);
  }
});

it('keeps authored choice titles unchanged', async () => {
  const titled = untitledStory(1);
  titled.interactions[1].title = 'Open the gate';
  await renderPlayer('/stories/story-1/play', titled);

  expect(await screen.findByRole('button', { name: 'Open the gate' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
});

it('labels a lone untitled starting point Start in Simulation', async () => {
  await renderPlayer('/stories/story-1/play?mode=simulation', untitledStory(1));

  expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
});

it('flags the reached title after choosing one of several untitled options', async () => {
  await renderPlayer(
    '/stories/story-1/play?mode=simulation&startInteractionId=start',
    untitledStory(2),
  );
  const [firstOption] = await screen.findAllByRole('img', { name: /Label required/ });
  const choice = firstOption.closest('button');
  if (!choice) {
    throw new Error('The flagged option is not a button.');
  }
  fireEvent.click(choice);

  const title = await screen.findByRole('textbox', { name: 'Current interaction title' });
  await waitFor(() => {
    expect(title).toHaveAttribute('aria-invalid', 'true');
  });
  expect(title).toHaveAttribute('placeholder', '');
});
