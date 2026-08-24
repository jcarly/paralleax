import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatDefinitionInspector } from './StatDefinitionInspector';

afterEach(cleanup);

describe('StatDefinitionInspector', () => {
  it('edits and persists a positive or negative hourly change', () => {
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <StatDefinitionInspector
        story={{
          id: 'story-1',
          title: 'Story',
          interactions: [],
          createdAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
        }}
        statDefinition={{ id: 'energy', name: 'Energy', changePerHour: -1 }}
        onChange={onChange}
        onPatch={onPatch}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onStory={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const rate = screen.getByLabelText('Change per story hour');
    fireEvent.change(rate, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'energy',
      name: 'Energy',
      changePerHour: 2.5,
    });
    fireEvent.blur(rate, { target: { value: '-1.5' } });
    expect(onPatch).toHaveBeenLastCalledWith('energy', { changePerHour: -1.5 });
  });
});
