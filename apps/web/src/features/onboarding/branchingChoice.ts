import type { Story } from '@paralleax/shared';

function* connectedDestinations(
  story: Story,
): Iterable<{ sourceId: string; targetId: string }> {
  for (const target of story.interactions) {
    for (const trigger of target.triggers) {
      for (const sourceId of trigger.inputInteractionIds) {
        yield { sourceId, targetId: target.id };
      }
    }
  }
}

export function storyHasBranchingChoice(story: Story): boolean {
  const destinationsBySource = new Map<string, Set<string>>();
  for (const { sourceId, targetId } of connectedDestinations(story)) {
    const destinations = destinationsBySource.get(sourceId) ?? new Set<string>();
    destinations.add(targetId);
    destinationsBySource.set(sourceId, destinations);
    if (destinations.size > 1) {
      return true;
    }
  }
  return false;
}
