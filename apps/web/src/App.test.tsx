import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('./pages/StoryEditor', () => ({ StoryEditor: () => <div>Editeur mock</div> }));
vi.mock('./pages/StoryPlayer', () => ({ StoryPlayer: () => <div>Lecteur mock</div> }));

describe('App', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.me).mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('renders the shell and list route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Paralleax' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Interactive story editor')).toBeInTheDocument();
    expect(screen.getByText('Liste mock')).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
