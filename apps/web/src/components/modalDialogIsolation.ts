import { getModalDialogFocusTargets } from './modalDialogKeyboard';

const portals: HTMLElement[] = [];
const originalInert = new Map<HTMLElement, boolean>();
let observer: MutationObserver | undefined;
let bodyOverflow = '';
let bodyOverflowPriority = '';

function updateIsolation() {
  const active = portals.at(-1);
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!originalInert.has(child)) originalInert.set(child, child.hasAttribute('inert'));
    child.toggleAttribute('inert', child !== active || originalInert.get(child) === true);
  }
}

function focusPortal(portal: HTMLElement) {
  if (portal.contains(document.activeElement)) return;
  const focusTargets = getModalDialogFocusTargets(portal);
  const preferredTarget = portal.querySelector<HTMLElement>('[data-modal-autofocus]');
  const initialTarget =
    preferredTarget && focusTargets.includes(preferredTarget) ? preferredTarget : focusTargets[0];
  (initialTarget ?? portal).focus({ preventScroll: true });
}

function containFocus() {
  const active = portals.at(-1);
  if (active) focusPortal(active);
}

export function isolateModalDialog(portal: HTMLElement, opener: Element | null) {
  const initialFocus =
    document.activeElement instanceof HTMLElement && portal.contains(document.activeElement)
      ? document.activeElement
      : undefined;
  if (portals.length === 0) {
    bodyOverflow = document.body.style.getPropertyValue('overflow');
    bodyOverflowPriority = document.body.style.getPropertyPriority('overflow');
    document.body.style.setProperty('overflow', 'hidden');
    observer = new MutationObserver(updateIsolation);
    observer.observe(document.body, { childList: true });
    document.addEventListener('focusin', containFocus);
  }
  portals.push(portal);
  updateIsolation();
  if (initialFocus?.isConnected) initialFocus.focus({ preventScroll: true });
  else focusPortal(portal);

  return () => {
    const wasActive = portals.at(-1) === portal;
    const index = portals.indexOf(portal);
    if (index !== -1) portals.splice(index, 1);
    const active = portals.at(-1);
    if (active) updateIsolation();
    else {
      observer?.disconnect();
      observer = undefined;
      document.removeEventListener('focusin', containFocus);
      for (const [element, inert] of originalInert) element.toggleAttribute('inert', inert);
      originalInert.clear();
      if (bodyOverflow)
        document.body.style.setProperty('overflow', bodyOverflow, bodyOverflowPriority);
      else document.body.style.removeProperty('overflow');
    }
    if (!wasActive) return;
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      !opener.closest('[inert]') &&
      (!active || active.contains(opener))
    ) {
      opener.focus({ preventScroll: true });
    } else if (active) focusPortal(active);
  };
}
