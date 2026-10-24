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
    expect(screen.getByText('Geist / system fallback')).toBeInTheDocument();
    expect(screen.getByText('Georgia')).toBeInTheDocument();
    expect(screen.getByText('Stories branch. Ideas connect.')).toHaveClass('display-sample-text');
    expect(screen.getByText('The Archive Below')).toHaveClass('heading-sample');
    expect(screen.getByText('A calm, readable rhythm keeps dense tools approachable.')).toHaveClass(
      'body-sample',
    );
    expect(screen.getByLabelText('Empty trigger marker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse stories' })).toHaveAttribute('href', '/');
  });
});
