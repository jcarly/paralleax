import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImageUrlField } from './ImageUrlField';

describe('ImageUrlField', () => {
  it('edits an image URL through the shared dialog and persists it on save', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBlur = vi.fn();

    render(
      <ImageUrlField
        imageUrl="https://images.example/current.png"
        onBlur={onBlur}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit image' }));
    const dialog = screen.getByRole('dialog', { name: 'Image' });
    const imageUrl = screen.getByLabelText('Image URL');
    await user.clear(imageUrl);
    await user.type(imageUrl, ' https://images.example/updated.png ');
    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save image' }));

    expect(onChange).toHaveBeenCalledWith('https://images.example/updated.png');
    expect(onBlur).toHaveBeenCalledWith('https://images.example/updated.png');
    expect(dialog).not.toBeInTheDocument();
  });

  it('does not change the image when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBlur = vi.fn();

    render(<ImageUrlField onBlur={onBlur} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add image' }));
    await user.type(screen.getByLabelText('Image URL'), 'https://images.example/new.png');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Image' })).not.toBeInTheDocument();
  });
});
