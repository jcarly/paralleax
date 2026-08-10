import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PrototypeAuthPage,
  PrototypeDesignSystem,
  PrototypeStoryList,
} from './ParalleaxPrototypePages';
import { prototypeRoutes } from './ParalleaxPrototypeRoutes';

afterEach(cleanup);

describe('Paralleax prototype portal', () => {
  it('moves from the local sign-in form to the story library', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<PrototypeAuthPage mode="login" onNavigate={onNavigate} />);

    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onNavigate).toHaveBeenCalledWith(prototypeRoutes.stories);
  });

  it('filters stories and creates a local story from the library', async () => {
    const user = userEvent.setup();
    render(<PrototypeStoryList onNavigate={vi.fn()} />);

    await user.type(screen.getByLabelText('Search stories'), 'Harbor');
    expect(screen.getByRole('heading', { name: 'Harbor Signals' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ashfall' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search stories'));
    await user.click(screen.getByRole('button', { name: 'New story' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a story' });
    await user.type(within(dialog).getByLabelText('Story title'), 'Moonlit Station');
    await user.click(within(dialog).getByRole('button', { name: 'Create story' }));

    expect(screen.getByRole('heading', { name: 'Moonlit Station' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('documents core controls and narrative-specific patterns', () => {
    render(<PrototypeDesignSystem onNavigate={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Product principles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forms and selection' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Narrative components' })).toBeInTheDocument();
    expect(screen.getByLabelText('Empty trigger marker')).toBeInTheDocument();
    expect(screen.getByText('--pp-accent')).toBeInTheDocument();
  });
});
