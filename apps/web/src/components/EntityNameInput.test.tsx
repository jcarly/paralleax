import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityNameInput } from './EntityNameInput';

function setup(onCommit = vi.fn().mockResolvedValue(true)) {
  function Harness() {
    const [name, setName] = useState('Original');
    return (
      <>
        <label>
          Name
          <EntityNameInput value={name} onChange={setName} onCommit={onCommit} />
        </label>
        <button>Outside</button>
      </>
    );
  }
  render(<Harness />);
  return { user: userEvent.setup(), input: screen.getByRole('textbox'), onCommit };
}
describe('shared entity name editing', () => {
  afterEach(cleanup);
  it('commits trimmed names on Enter and blur, with Escape restoring the focus-time value', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.type(input, '  Renamed  {Enter}');
    expect(onCommit).toHaveBeenLastCalledWith('Renamed');
    expect(input).toHaveValue('Renamed');
    await user.clear(input);
    await user.type(input, 'Discard{Escape}');
    expect(input).toHaveValue('Renamed');
    expect(onCommit).toHaveBeenCalledTimes(1);
    await user.clear(input);
    await user.type(input, 'Saved on blur');
    await user.click(screen.getByRole('button'));
    expect(onCommit).toHaveBeenLastCalledWith('Saved on blur');
  });
  it('retains failed drafts for retry and rejects empty names without saving', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    expect(onCommit).not.toHaveBeenCalled();
    onCommit.mockRejectedValueOnce(new Error('Offline'));
    await user.type(input, 'Draft{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
    expect(input).toHaveValue('Draft');
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Original');
  });
});
