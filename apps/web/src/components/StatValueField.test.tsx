import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatValueField } from './StatValueField';

describe('StatValueField', () => {
  it('commits boolean selections immediately', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();

    render(
      <StatValueField
        ariaLabel="Enabled"
        valueType="boolean"
        value={false}
        onChange={onChange}
        onBlur={onBlur}
      />,
    );

    fireEvent.change(screen.getByLabelText('Enabled'), { target: { value: 'true' } });

    expect(onChange).toHaveBeenCalledWith(true);
    expect(onBlur).toHaveBeenCalledWith(true);
  });

  it('converts number edits and blur values to numbers', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();

    render(
      <StatValueField
        ariaLabel="Score"
        valueType="number"
        value={1}
        onChange={onChange}
        onBlur={onBlur}
      />,
    );

    const input = screen.getByLabelText('Score');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input, { target: { value: '13' } });

    expect(onChange).toHaveBeenCalledWith(12);
    expect(onBlur).toHaveBeenCalledWith(13);
  });

  it('preserves string edits', () => {
    const onChange = vi.fn();

    render(
      <StatValueField ariaLabel="Nickname" valueType="string" value="A" onChange={onChange} />,
    );

    const input = screen.getByLabelText('Nickname');
    fireEvent.change(input, { target: { value: 'Ada' } });
    fireEvent.blur(input, { target: { value: 'Ada' } });

    expect(onChange).toHaveBeenCalledWith('Ada');
  });
});
