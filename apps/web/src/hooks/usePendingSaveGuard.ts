import { useEffect } from 'react';

const pendingSaveMessage =
  'This story still has unsaved changes. Leave this page and discard them?';

export function usePendingSaveGuard(shouldBlock: boolean) {
  useEffect(() => {
    if (!shouldBlock) return;

    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }
      if (window.confirm(pendingSaveMessage)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('beforeunload', preventUnload);
    document.addEventListener('click', confirmInternalNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      document.removeEventListener('click', confirmInternalNavigation, true);
    };
  }, [shouldBlock]);
}
