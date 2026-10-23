import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { leavesPendingSaveSurface, usePendingSaveGuard } from './usePendingSaveGuard';

function GuardFixture({
  active,
  surface = 'editor',
}: {
  active: boolean;
  surface?: 'editor' | 'player';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const guard = usePendingSaveGuard(active && location.pathname.endsWith('/edit'), surface);
  return (
    <>
      {guard}
      <p data-testid="location">
        {location.pathname}
        {location.search}
      </p>
      <Link to="/other">Leave by link</Link>
      <button onClick={() => navigate('/other')}>Leave by code</button>
    </>
  );
}

function mount(active = true, surface: 'editor' | 'player' = 'editor') {
  const router = createMemoryRouter(
    [{ path: '*', element: <GuardFixture active={active} surface={surface} /> }],
    { initialEntries: ['/other', '/stories/story-1/edit'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('usePendingSaveGuard', () => {
  afterEach(cleanup);

  it('protects browser unload while a save is unresolved', () => {
    mount();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it('blocks back and forward, supports staying and leaving', async () => {
    const router = mount();
    await router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stay on this page' })).toHaveFocus(),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/stories/story-1/edit');
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await router.navigate(-1);
    await userEvent.click(await screen.findByRole('button', { name: 'Leave page' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/other'));
    await router.navigate(1);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/stories/story-1/edit'),
    );
  });

  it('blocks links and code navigation', async () => {
    mount();
    await userEvent.click(screen.getByRole('link', { name: 'Leave by link' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave by code' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('allows navigation after saving succeeds', async () => {
    mount(false);
    fireEvent.click(screen.getByRole('link', { name: 'Leave by link' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/other'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('distinguishes editor queries and reader sessions', () => {
    const location = (pathname: string, search = '') => ({ pathname, search });
    expect(
      leavesPendingSaveSurface(
        location('/stories/one/edit'),
        location('/stories/one/edit', '?settings=access'),
        'editor',
      ),
    ).toBe(false);
    expect(
      leavesPendingSaveSurface(
        location('/stories/one/play'),
        location('/stories/one/play', '?mode=simulation'),
        'player',
      ),
    ).toBe(true);
    expect(
      leavesPendingSaveSurface(
        location('/stories/one/play', '?mode=simulation&startInteractionId=a'),
        location('/stories/one/play', '?mode=simulation&startInteractionId=b'),
        'player',
      ),
    ).toBe(true);
    expect(
      leavesPendingSaveSurface(
        location('/stories/one/play', '?foo=1'),
        location('/stories/one/play', '?foo=2'),
        'player',
      ),
    ).toBe(false);
    expect(
      leavesPendingSaveSurface(
        location('/stories/one/play'),
        location('/stories/two/play'),
        'player',
      ),
    ).toBe(true);
  });
});
