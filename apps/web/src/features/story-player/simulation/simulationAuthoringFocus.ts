import { isRealtimeEditableTarget } from '../../realtime/storyRealtime';

export function isSimulationAuthoringTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return isRealtimeEditableTarget(target);
  }
  return (
    isRealtimeEditableTarget(target) ||
    target.closest('.rich-text-editor, .simulation-content-add, [role="dialog"]') !== null ||
    target.matches('.simulation-body-preview')
  );
}

export function shouldKeepSimulationEditingOnBlur(
  target: EventTarget | null,
  relatedTarget: EventTarget | null,
  bodyEditorIsOpen: boolean,
): boolean {
  if (isSimulationAuthoringTarget(relatedTarget)) {
    return true;
  }
  return (
    bodyEditorIsOpen &&
    target instanceof Element &&
    target.matches('.simulation-body-preview, .simulation-content-add')
  );
}
