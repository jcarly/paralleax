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
        statDefinition={{ id: 'energy', name: 'Energy', changePerHour: -1 }}
        onChange={onChange}
        onPatch={onPatch}
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
