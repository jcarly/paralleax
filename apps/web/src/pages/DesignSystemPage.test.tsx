import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    for (const token of [
      '--color-text',
      '--color-primary',
      '--color-primary-soft',
      '--color-trigger',
      '--color-surface',
      '--color-canvas',
      '--color-border',
      '--color-danger',
    ]) {
      const tokenLabel = screen.getByText(token);
      expect(tokenLabel.closest('.swatch')?.querySelector('span')).toHaveStyle({
        background: `var(${token})`,
      });
    }
    expect(document.querySelector('.swatch-grid')?.textContent).not.toMatch(/#[\da-f]{3,8}/i);
    expect(
      screen.getByText(/var\(--type-size-display\) \/ var\(--type-leading-display\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/var\(--type-size-heading\) \/ var\(--type-leading-heading\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/var\(--type-size-body\) \/ var\(--type-leading-body\)/),
    ).toBeInTheDocument();

    const requiredField = screen.getByRole('textbox', { name: /Required field/ });
    expect(requiredField).toHaveAttribute('aria-invalid', 'true');
    expect(requiredField).toHaveAttribute('aria-describedby', 'design-required-field-error');
    expect(document.getElementById('design-required-field-error')).toHaveTextContent(
      'This field cannot be empty.',
    );

    expect(screen.getByRole('button', { name: 'Linked Trigger marker' })).toHaveClass(
      'trigger-marker',
    );
    expect(screen.getByRole('button', { name: 'Selected linked Trigger marker' })).toHaveClass(
      'trigger-marker',
      'selected',
    );

    const contextRows = document.querySelectorAll('.reference-card .context-entity-row');
    expect(contextRows).toHaveLength(3);
    expect(document.querySelector('.context-reference')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mara Venn' })).toHaveClass(
      'context-entity-select',
      'selected',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mara Venn' }));
    expect(screen.getByRole('button', { name: 'Mara Venn' })).toBeInTheDocument();

    const effectCard = document.querySelector('.narrative-reference .interaction-effect-card');
    expect(effectCard).toBeInTheDocument();
    expect(effectCard?.querySelector('.interaction-effect-title')).toHaveTextContent(
      'Stat change 1',
    );
    expect(effectCard?.querySelector('.interaction-effect-fields')).toBeInTheDocument();
    expect(document.querySelector('.design-effect-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove stat effect' }));
    expect(
      document.querySelector('.narrative-reference .interaction-effect-card'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse stories' })).toHaveAttribute('href', '/');
  });
});
