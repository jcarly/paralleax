import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeInterfaceLanguage } from '../i18n';
import { reportBrowserError } from '../observability/browserMonitoring';

vi.mock('../observability/browserMonitoring', () => ({
  reportBrowserError: vi.fn(),
}));
import { isDynamicImportError } from '../observability/dynamicImportError';
import { RouteErrorPage } from './RouteErrorPage';

function CrashingPage({ message }: { message: string }): null {
  throw new TypeError(message);
}

function renderRouteError(message: string) {
  const router = createMemoryRouter(
    [{ path: '/', element: <CrashingPage message={message} />, errorElement: <RouteErrorPage /> }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
}

describe('dynamic import detection', () => {
  it('detects missing dynamic imports without confusing generic errors', () => {
    expect(
      isDynamicImportError(
        new TypeError('Failed to fetch dynamically imported module: /assets/AdminUsersPage-abc.js'),
      ),
    ).toBe(true);
    expect(isDynamicImportError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isDynamicImportError(new Error('Loading chunk 42 failed.'))).toBe(true);
    expect(isDynamicImportError(new Error('Network request failed'))).toBe(false);
    expect(isDynamicImportError(null)).toBe(false);
  });

});

describe('RouteErrorPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('offers a manual refresh after a stale chunk failure without reloading automatically', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderRouteError('Failed to fetch dynamically imported module: /assets/AdminUsersPage-abc.js');

    expect(
      screen.getByRole('heading', { name: 'Unable to load this page' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reloading may discard unsaved changes.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reload Paralleax' })).toHaveAttribute(
      'href',
      window.location.href,
    );
    expect(reportBrowserError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to fetch dynamically imported module: /assets/AdminUsersPage-abc.js',
      }),
      'dynamic-import',
    );
  });

  it('does not mislabel a runtime exception as a deployment update', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderRouteError('Unknown runtime exception');

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.queryByText(/updated while this tab was open/)).not.toBeInTheDocument();
    expect(reportBrowserError).toHaveBeenCalledWith(expect.any(Error), 'route-error');
  });

  it('shows a translated recovery message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await changeInterfaceLanguage('fr');
    renderRouteError('Failed to fetch dynamically imported module: /assets/StoryEditor-abc.js');

    expect(
      screen.getByRole('heading', { name: 'Impossible de charger cette page' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recharger Paralleax' })).toBeInTheDocument();
  });
});
