import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./pages/StoryList', () => ({ StoryList: () => <div>Liste mock</div> }));
vi.mock('./pages/StoryEditor', () => ({ StoryEditor: () => <div>Editeur mock</div> }));
vi.mock('./pages/StoryPlayer', () => ({ StoryPlayer: () => <div>Lecteur mock</div> }));

describe('App', () => {
  afterEach(() => cleanup());

  it('renders the shell and list route', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Paralleax' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Interactive story editor')).toBeInTheDocument();
    expect(screen.getByText('Liste mock')).toBeInTheDocument();
  });

  it('routes to editor and player pages', () => {
    render(<MemoryRouter initialEntries={['/stories/story-1/edit']}><App /></MemoryRouter>);
    expect(screen.getByText('Editeur mock')).toBeInTheDocument();

    cleanup();
    render(<MemoryRouter initialEntries={['/stories/story-1/play']}><App /></MemoryRouter>);
    expect(screen.getByText('Lecteur mock')).toBeInTheDocument();
  });
});
