import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { ExpressionEditor } from './ExpressionEditor';

afterEach(cleanup);

const story: Story = {
  id: 'story',
  title: 'Expression story',
  createdAt: '2026-10-21T08:00:00Z',
  updatedAt: '2026-10-21T08:00:00Z',
  statDefinitions: [{ id: 'number', name: 'Score', valueType: 'number' }],
  stats: [{ id: 'score', statDefinitionId: 'number', initialValue: 2 }],
  interactions: [],
};

describe('ExpressionEditor', () => {
  it('keeps an incomplete draft and saves only a valid matching expression on blur', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(
      <ExpressionEditor
        story={story}
        value="@{score}"
        expectedType="number"
        onChange={onChange}
        onBlur={onBlur}
      />,
    );
    const field = screen.getByRole('textbox');
    for (const value of ['', '@{score} +', '@{foreign}', 'true']) {
      fireEvent.change(field, { target: { value } });
      fireEvent.blur(field);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(onBlur).not.toHaveBeenCalled();
    }
    fireEvent.change(field, { target: { value: '(@{score} + 2) * 3' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenLastCalledWith('(@{score} + 2) * 3');
    expect(onBlur).toHaveBeenCalledExactlyOnceWith('(@{score} + 2) * 3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('inserts a stable variable reference after navigating the shared picker', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const { rerender } = render(
      <ExpressionEditor story={story} value="" onChange={onChange} onBlur={onBlur} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert variable' }));
    fireEvent.change(screen.getByLabelText('Variable owner'), {
      target: { value: 'owner:story:story' },
    });
    fireEvent.change(screen.getByLabelText('Variable or item in Expression story'), {
      target: { value: 'variable:story:score' },
    });
    expect(onBlur).toHaveBeenLastCalledWith('@{score}');
    expect(screen.queryByLabelText('Variable owner')).not.toBeInTheDocument();

    rerender(
      <ExpressionEditor story={story} value="@{score} + " onChange={onChange} onBlur={onBlur} />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('@{score} + ');
    fireEvent.click(screen.getByRole('button', { name: 'Insert variable' }));
    fireEvent.change(screen.getByLabelText('Variable owner'), {
      target: { value: 'owner:story:story' },
    });
    fireEvent.change(screen.getByLabelText('Variable or item in Expression story'), {
      target: { value: 'variable:story:score' },
    });
    expect(onBlur).toHaveBeenLastCalledWith('@{score} +@{score}');
  });
});
