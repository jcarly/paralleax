import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';

vi.mock('./api', () => ({
  api: {
    me: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('./pages/StoryList', () => ({ StoryList: () => <div>Liste mock</div> }));
vi.mock('./pages/DesignSystemPage', () => ({
  DesignSystemPage: () => <div>Design system mock</div>,
}));
vi.mock('./pages/StoryEditor', () => ({ StoryEditor: () => <div>Editeur mock</div> }));
vi.mock('./pages/StoryPlayer', () => ({ StoryPlayer: () => <div>Lecteur mock</div> }));
vi.mock('./pages/ParalleaxPrototype', () => ({
  ParalleaxPrototype: () => <div>Prototype mock</div>,
}));

describe('App', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.me).mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('opens every prototype sub-route without checking the real account session', () => {
    render(
      <MemoryRouter initialEntries={['/prototype/paralleax/design-system']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Prototype mock')).toBeInTheDocument();
    expect(api.me).not.toHaveBeenCalled();
  });

  it('renders the shell and list route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Paralleax' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Design system' })).toHaveAttribute(
      'href',
      '/design-system',
    );
    expect(screen.getByText('Liste mock')).toBeInTheDocument();
  });

  it('routes to the authenticated design system', async () => {
    render(
      <MemoryRouter initialEntries={['/design-system']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Design system mock')).toBeInTheDocument();
  });

  it('routes to editor and player pages', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();

    cleanup();
    render(
      <MemoryRouter initialEntries={['/stories/story-1/play']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Lecteur mock')).toBeInTheDocument();
  });

  it('shows authentication when there is no active session', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Sign in to Paralleax' }),
    ).toBeInTheDocument();
  });

  it('opens registration directly from its public route', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('returns to sign in with a clear notice when the session expires', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Liste mock')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('paralleax:session-expired')));

    expect(screen.getByRole('heading', { name: 'Sign in to Paralleax' })).toBeInTheDocument();
    expect(
      screen.getByText('Your session expired. Sign in again to continue.'),
    ).toBeInTheDocument();
  });
});
