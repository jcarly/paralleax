import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocationInspector } from './LocationInspector';

describe('LocationInspector', () => {
  it('edits the location image through the shared image dialog', async () => {
    const user = userEvent.setup();
    const onLocalChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const location = { id: 'location-1', name: 'Harbor', description: '' };

    render(
      <LocationInspector
        itemDefinitions={[]}
        location={location}
        statDefinitions={[]}
        onLocalChange={onLocalChange}
        onMoveItem={vi.fn().mockResolvedValue(undefined)}
        onPatch={onPatch}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Location' });
    const imageFrame = screen.getByRole('button', { name: 'Add image' });
    expect(heading.nextElementSibling).toContainElement(imageFrame);

    await user.click(imageFrame);
    await user.type(screen.getByLabelText('Image URL'), 'https://images.example/harbor.png');
    await user.click(screen.getByRole('button', { name: 'Save image' }));

    expect(onLocalChange).toHaveBeenCalledWith({
      ...location,
      imageUrl: 'https://images.example/harbor.png',
    });
    expect(onPatch).toHaveBeenCalledWith('location-1', {
      imageUrl: 'https://images.example/harbor.png',
    });
  });
});
