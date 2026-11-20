import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('../features/rich-text/RichTextEditor', () => ({
  RichTextEditor: ({ value }: { value: string }) => {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <div data-testid="tiptap-editor">{value}</div>;
  },
}));

async function loadWrapper() {
  vi.resetModules();
  const [{ RichTextEditor }, { preloadRichTextEditor }] = await Promise.all([
    import('./RichTextEditor'),
    import('./richTextEditorLoader'),
  ]);
  return { RichTextEditor, preloadRichTextEditor };
}

const props = { value: 'Body', onChange: vi.fn(), onBlur: vi.fn() };

describe('RichTextEditor loader', () => {
  beforeEach(() => {
    mounts.count = 0;
  });
  afterEach(cleanup);

  it('shows the loading state until the editor chunk arrives when it was not preloaded', async () => {
    const { RichTextEditor } = await loadWrapper();

    render(<RichTextEditor {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByTestId('tiptap-editor')).toHaveTextContent('Body');
  });

  it('renders a preloaded editor at once, without the loading state', async () => {
    const { RichTextEditor, preloadRichTextEditor } = await loadWrapper();
    await preloadRichTextEditor();

    render(<RichTextEditor {...props} />);

    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps an editor mounted while the preload finishes', async () => {
    const { RichTextEditor, preloadRichTextEditor } = await loadWrapper();
    const view = render(<RichTextEditor {...props} />);
    await screen.findByTestId('tiptap-editor');

    await act(async () => {
      await preloadRichTextEditor();
    });
    view.rerender(<RichTextEditor {...props} value="Body edited" />);

    expect(screen.getByTestId('tiptap-editor')).toHaveTextContent('Body edited');
    expect(mounts.count).toBe(1);
  });
});
