import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryAccessPage } from './StoryAccessPage';

function EditorRoute() {
  const location = useLocation();
  return <p>{`${location.pathname}${location.search}`}</p>;
}

describe('StoryAccessPage', () => {
  afterEach(() => cleanup());

  it('keeps legacy access URLs compatible by opening the editor access settings', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/access']}>
        <Routes>
          <Route path="/stories/:storyId/access" element={<StoryAccessPage />} />
          <Route path="/stories/:storyId/edit" element={<EditorRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('/stories/story-1/edit?settings=access')).toBeInTheDocument();
  });
});
