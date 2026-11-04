import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { i18n } from '../../i18n';
import { StoryUnavailablePage } from './StoryUnavailablePage';

afterEach(cleanup);

describe('StoryUnavailablePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('explains an inaccessible Story without exposing its title and keeps a safe sign-in path', () => {
    render(
      <MemoryRouter>
        <StoryUnavailablePage
          authenticated={false}
          returnTo="/stories/secret-story/play?mode=simulation"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Story unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/unavailable or your account/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fstories%2Fsecret-story%2Fplay%3Fmode%3Dsimulation',
    );
    expect(screen.queryByText('Secret Story')).not.toBeInTheDocument();
  });
});

describe('StoryUnavailablePage access settings', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('returns a signed-in editor to the Story when access settings are unavailable', () => {
    render(
      <MemoryRouter>
        <StoryUnavailablePage
          authenticated
          reason="access-settings"
          returnTo="/stories/story-1/edit?settings=access"
          storyId="story-1"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Access settings unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to story' })).toHaveAttribute(
      'href',
      '/stories/story-1/edit',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('offers sign-in from inaccessible Access settings to an anonymous visitor', () => {
    render(
      <MemoryRouter>
        <StoryUnavailablePage
          authenticated={false}
          reason="access-settings"
          returnTo="/stories/story-1/edit?settings=access"
          storyId="story-1"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fstories%2Fstory-1%2Fedit%3Fsettings%3Daccess',
    );
  });
});
