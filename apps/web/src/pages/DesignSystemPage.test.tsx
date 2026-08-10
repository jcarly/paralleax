import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignSystemPage } from './DesignSystemPage';

describe('DesignSystemPage', () => {
  afterEach(() => cleanup());

  it('documents foundations, controls, and narrative patterns', () => {
    render(
      <MemoryRouter>
        <DesignSystemPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'A calm interface for complex stories.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Color, type, and shape' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Narrative components' })).toBeInTheDocument();
    expect(screen.getByLabelText('Empty trigger marker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse stories' })).toHaveAttribute('href', '/');
  });
});
