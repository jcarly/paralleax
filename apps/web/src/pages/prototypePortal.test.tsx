import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PrototypeAuthPage,
  PrototypeDesignSystem,
  PrototypeStoryList,
} from './ParalleaxPrototypePages';
import { prototypeRoutes, prototypeStoryRoute } from './ParalleaxPrototypeRoutes';

afterEach(cleanup);

it('moves from the local sign-in form to the story library', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  const { container } = render(<PrototypeAuthPage mode="login" onNavigate={onNavigate} />);

  expect(container.querySelector('.pp-auth-showcase')).not.toBeInTheDocument();
  expect(screen.getByText(/no account data is submitted/i)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Email address'), 'author@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Sign in' }));

  expect(onNavigate).toHaveBeenCalledWith(prototypeRoutes.stories);
});

it('previews password recovery locally without sending an email', async () => {
  const user = userEvent.setup();
  render(<PrototypeAuthPage mode="login" onNavigate={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
  await user.type(screen.getByLabelText('Email address'), 'author@example.com');
  await user.click(screen.getByRole('button', { name: /preview recovery/i }));

  expect(screen.getByRole('status')).toHaveTextContent('No email was sent');
});

it('opens a named scenario from a library without invented cover or story metrics', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  const { container } = render(<PrototypeStoryList onNavigate={onNavigate} />);

  expect(container.querySelector('.pp-story-cover')).not.toBeInTheDocument();
  expect(container.querySelectorAll('.pp-story-card')).toHaveLength(4);
  await user.click(
    within(screen.getByRole('article', { name: /harbor signals/i })).getByRole('button', {
      name: /open story/i,
    }),
  );
  expect(onNavigate).toHaveBeenCalledWith(prototypeStoryRoute('harbor-signals'));
});

it('filters stories, creates an empty story, and confirms local deletion', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  render(<PrototypeStoryList onNavigate={onNavigate} />);

  await user.type(screen.getByLabelText('Search stories'), 'Harbor');
  expect(screen.getByRole('heading', { name: 'Harbor Signals' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Ashfall' })).not.toBeInTheDocument();

  await user.clear(screen.getByLabelText('Search stories'));
  await user.click(screen.getByRole('button', { name: 'New story' }));
  const dialog = screen.getByRole('dialog', { name: 'Create a story' });
  await user.type(within(dialog).getByLabelText('Story title'), 'Moonlit Station');
  await user.click(within(dialog).getByRole('button', { name: 'Create story' }));

  expect(screen.getByRole('heading', { name: 'Moonlit Station' })).toBeInTheDocument();
  await user.click(
    within(screen.getByRole('article', { name: /moonlit station/i })).getByRole('button', {
      name: /open story/i,
    }),
  );
  expect(onNavigate).toHaveBeenCalledWith(prototypeStoryRoute('blank'));

  await user.click(screen.getByRole('button', { name: 'Delete Harbor Signals' }));
  const deleteDialog = screen.getByRole('dialog', { name: /delete “harbor signals”/i });
  await user.click(within(deleteDialog).getByRole('button', { name: 'Delete story' }));
  expect(screen.queryByRole('heading', { name: 'Harbor Signals' })).not.toBeInTheDocument();
});

it('documents shared product tokens and narrative patterns', () => {
  render(<PrototypeDesignSystem onNavigate={vi.fn()} />);

  expect(screen.getByRole('heading', { name: 'Product principles' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Forms and selection' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Narrative components' })).toBeInTheDocument();
  expect(screen.getByLabelText('Empty trigger marker')).toBeInTheDocument();
  expect(screen.getAllByText('--color-primary').length).toBeGreaterThan(0);
  expect(screen.getByText('Geist')).toBeInTheDocument();
});

it('keeps both prototype stylesheets on shared tokens and the shared type ramp', () => {
  const styles = [
    readFileSync(resolve(process.cwd(), 'src/pages/ParalleaxPrototype.css'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/pages/ParalleaxPrototypePages.css'), 'utf8'),
  ].join('\n');

  expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(styles).not.toContain('--pp-');
  expect(styles).toContain('var(--font-interface)');
  expect(styles).toContain('var(--color-primary)');
});
